// src/solicitudes/solicitudes.service.ts
import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Solicitud } from './schemas/solicitud.schema';
import { OrdenReserva } from './schemas/orden-reserva.schema';
import { Stall } from 'src/stalls/entities/stall.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import * as FormData from 'form-data';
import * as https from 'https';
@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    @InjectModel(Solicitud.name) private solicitudModel: Model<Solicitud>,
    @InjectModel(OrdenReserva.name) private ordenModel: Model<OrdenReserva>,
    @InjectModel(Stall.name) private stallModel: Model<Stall>,
    private readonly http: HttpService,
  ) {
    this.sincronizarDeudas();
  }

  async crearSolicitud(dto: any) {
    try {
      const fechaInicio = new Date(dto.fechaInicio);
      const fechaFin = new Date(dto.fechaFin);
      if (isNaN(+fechaInicio) || isNaN(+fechaFin)) {
        throw new BadRequestException('Fechas inválidas');
      }
      if (fechaFin < fechaInicio) {
        throw new BadRequestException('fechaFin < fechaInicio');
      }

      // 1) Buscar puesto y validar estado LIBRE/DISPONIBLE
      const stall = await this.stallModel.findById(dto.stallId).lean();
      if (!stall) throw new BadRequestException('Puesto no existe');
      if (stall.estado !== 'LIBRE' && stall.estado !== 'disponible') {
        throw new BadRequestException('El puesto no está disponible');
      }

      // 2) Bloquear duplicados
      const ESTADOS_BLOQUEO = [
        'EN_SOLICITUD',
        'POSTULADA',
        'APROBADA',
      ] as const;

      const existePorPersona = await this.solicitudModel.exists({
        cedula: String(dto.cedula).trim(),
        estado: { $in: ESTADOS_BLOQUEO as unknown as string[] },
      });
      if (existePorPersona) {
        throw new BadRequestException(
          'La persona ya tiene una solicitud en proceso (EN_SOLICITUD/POSTULADA/APROBADA)',
        );
      }

      const existePorPuesto = await this.solicitudModel.exists({
        stall: new Types.ObjectId(dto.stallId),
        estado: { $in: ESTADOS_BLOQUEO as unknown as string[] },
      });
      if (existePorPuesto) {
        throw new BadRequestException(
          'El puesto ya tiene una solicitud en proceso (EN_SOLICITUD/POSTULADA/APROBADA)',
        );
      }

      // 3) denormalizar
      const marketId = stall.market as unknown as Types.ObjectId;
      const section = stall.section || null;

      // 4) Crear solicitud (incluimos manual/usuario si vienen)
      const isManual = !!dto.manual || !!dto.usuario;
      const usuario =
        typeof dto.usuario === 'string' ? dto.usuario.trim() : null;

      return await this.solicitudModel.create({
        stall: new Types.ObjectId(dto.stallId),
        market: marketId,
        marketName: stall.blockName || '',
        section,
        nombres: dto.nombres,
        cedula: String(dto.cedula).trim(),
        dactilar: dto.dactilar,
        correo: dto.correo,
        telefono: dto.telefono,
        provincia: dto.provincia,
        ciudad: dto.ciudad,
        fechaInicio,
        fechaFin,
        estado: 'EN_SOLICITUD',

        // 🔹 Estos campos solo persistirán si tu schema de Solicitud los permite
        manual: isManual,
        usuario,
      });
    } catch (e) {
      this.logger.error(
        '[crearSolicitud] Error',
        e instanceof Error ? e.stack : String(e),
      );
      throw e instanceof BadRequestException
        ? e
        : new BadRequestException('No se pudo crear la solicitud');
    }
  }
  private extractCodPuestoFromCode(code?: string): string {
    if (!code) return '';
    const parts = String(code).split('T-');
    return parts.length > 1 ? parts[1].trim() : code.trim();
  }

  private s(obj: any, max = 1200) {
    // stringify compacto y truncado para logs
    const str = (() => {
      try {
        return JSON.stringify(obj);
      } catch {
        return String(obj);
      }
    })();
    return str.length > max
      ? `${str.slice(0, max)}…(+${str.length - max} chars)`
      : str;
  }
  async postular(solicitudId: string, ip: string) {
    const t0 = Date.now();
    this.logger.log(`[POSTULAR] start solicitudId=${solicitudId} ip=${ip}`);

    // 0) Cargar solicitud y validaciones
    const solicitud = await this.solicitudModel.findById(solicitudId);
    if (!solicitud) {
      this.logger.warn(`[POSTULAR] Solicitud no existe: ${solicitudId}`);
      throw new BadRequestException('Solicitud no existe');
    }
    this.logger.debug(
      `[POSTULAR] Solicitud cargada estado=${solicitud.estado} stall=${solicitud.stall}`,
    );
    if (solicitud.estado !== 'EN_SOLICITUD') {
      this.logger.warn(`[POSTULAR] Estado inválido: ${solicitud.estado}`);
      throw new BadRequestException('Estado inválido');
    }
    if (!solicitud.stall) {
      this.logger.warn(`[POSTULAR] Solicitud sin puesto asignado`);
      throw new BadRequestException('Solicitud sin puesto asignado');
    }

    // 🔹 Modo manual
    const isManual =
      Boolean((solicitud as any)?.manual) ||
      Boolean((solicitud as any)?.usuario);
    const usuarioSolicitante =
      (typeof (solicitud as any)?.usuario === 'string'
        ? (solicitud as any).usuario.trim()
        : null) || null;

    const cedula = String(solicitud.cedula);
    const cedulaMask = cedula;

    // Guards anti-duplicados
    const yaTienePuesto = await this.stallModel.exists({
      'personaACargoActual.cedula': cedula,
      estado: { $in: ['OCUPADO', 'RESERVADO'] },
    });
    this.logger.debug(
      `[POSTULAR] Guard yaTienePuesto=${!!yaTienePuesto} cedula=${cedulaMask}`,
    );
    if (yaTienePuesto) {
      this.logger.warn(
        `[POSTULAR] Usuario ya tiene puesto asignado/reservado cedula=${cedulaMask}`,
      );
      throw new BadRequestException(
        'Ya tienes un puesto asignado o reservado.',
      );
    }

    const ordenActiva = await this.ordenModel.exists({
      'persona.cedula': cedula,
      estado: { $in: ['EN_SOLICITUD', 'ASIGNADA', 'OCUPADA'] },
    });
    this.logger.debug(
      `[POSTULAR] Guard ordenActiva=${!!ordenActiva} cedula=${cedulaMask}`,
    );
    if (ordenActiva) {
      this.logger.warn(
        `[POSTULAR] Usuario tiene orden activa en proceso cedula=${cedulaMask}`,
      );
      throw new BadRequestException('Tienes una orden activa en proceso.');
    }

    const otraSolicitud = await this.solicitudModel.exists({
      _id: { $ne: solicitud._id },
      cedula,
      estado: { $in: ['EN_SOLICITUD', 'POSTULADA', 'APROBADA'] },
    });
    this.logger.debug(
      `[POSTULAR] Guard otraSolicitud=${!!otraSolicitud} cedula=${cedulaMask}`,
    );
    if (otraSolicitud) {
      this.logger.warn(
        `[POSTULAR] Ya existe otra solicitud en curso cedula=${cedulaMask}`,
      );
      throw new BadRequestException('Ya tienes una solicitud en curso.');
    }

    // 1) Reserva atómica del puesto
    const aprobarAntesDe = new Date(Date.now() + 24 * 60 * 60 * 1000);
    this.logger.debug(
      `[POSTULAR] Intentando reservar stall=${solicitud.stall} hasta=${aprobarAntesDe.toISOString()}`,
    );
    const stall = await this.stallModel.findOneAndUpdate(
      { _id: solicitud.stall, estado: { $in: ['LIBRE', 'disponible'] } },
      { $set: { estado: 'RESERVADO', reservadoHasta: aprobarAntesDe } },
      { new: true },
    );
    if (!stall) {
      this.logger.warn(
        `[POSTULAR] Conflicto: el puesto ya no está libre stall=${solicitud.stall}`,
      );
      throw new BadRequestException('Conflicto: el puesto ya no está libre');
    }
    this.logger.log(
      `[POSTULAR] Puesto reservado stall=${stall._id} estado=${stall.estado}`,
    );

    // 2) Crear Orden interna (agregamos manual/usuario si aplica)
    const ultimo: any = await this.ordenModel
      .findOne({}, {}, { sort: { secuencial: -1 } })
      .lean();
    const secuencial = (ultimo?.secuencial || 0) + 1;
    const referencia = String(secuencial).padStart(4, '0');

    const baseOrden: any = {
      secuencial,
      referencia,
      market: solicitud.market,
      section: solicitud.section,
      stall: stall._id,
      solicitud: solicitud._id,
      fechaInicio: solicitud.fechaInicio,
      fechaFin: solicitud.fechaFin,
      estado: 'EN_SOLICITUD',
      aprobarAntesDe,
      persona: {
        nombre: solicitud.nombres,
        apellido: '',
        cedula: solicitud.cedula,
        telefono: solicitud.telefono,
        email: solicitud.correo,
        codigoDactilar: solicitud.dactilar,
        provincia: solicitud?.provincia || '',
        ciudad: solicitud?.ciudad || '',
      },
    };
    console.log('aaaaaaaaaaaaaaaaaaa', isManual);
    if (isManual) {
      baseOrden.manual = true;
      if (usuarioSolicitante) baseOrden.usuario = usuarioSolicitante;

      // 🔹 Crear pagoExterno inmediatamente (sin integración)
      baseOrden.pagoExterno = {
        tipo: 'manual',
        creadoPor: usuarioSolicitante || 'sistema',
        ip,
        fecha: new Date(),
        detalle: 'Pago/registro manual sin integración externa',
      };
    }

    let orden: any = await this.ordenModel.create(baseOrden);
    this.logger.log(
      `[POSTULAR] Orden creada id=${orden._id} secuencial=${secuencial} ref=${referencia} manual=${!!isManual}`,
    );

    await this.solicitudModel.findByIdAndUpdate(solicitud._id, {
      $set: {
        estado: 'POSTULADA',
        ordenId: orden._id,
        manual: isManual,
        usuario: usuarioSolicitante,
      },
    });
    this.logger.debug(
      `[POSTULAR] Solicitud actualizada a POSTULADA solicitud=${solicitud._id} orden=${orden._id}`,
    );

    // 3) Integración externa SOLO si NO es manual
    let respuestaExterna: any = null;

    if (!isManual) {
      // === Flujo original con SESSION_ID y saveSolicitud ===
      // Paso 1: Obtener SESSION_ID subiendo la imagen quemada
      let sessionId: string | null = null;
      try {
        sessionId = await this.subirPdfYObtenerRespuesta();
        this.logger.debug(`[POSTULAR] SESSION_ID obtenido=${sessionId || ''}`);
        if (!sessionId) {
          throw new BadRequestException(
            'SESSION_ID es requerido para saveSolicitud',
          );
        }
      } catch (e) {
        this.logger.error(
          `[POSTULAR] Error obteniendo SESSION_ID: ${e instanceof Error ? e.message : e}`,
        );
        // Compensar reserva
        await this.stallModel.findByIdAndUpdate(stall._id, {
          $set: { estado: 'LIBRE', reservadoHasta: null },
        });
        await this.solicitudModel.findByIdAndUpdate(solicitud._id, {
          $set: { estado: 'RECHAZADA' },
          $unset: { ordenId: '' },
        });
        await this.ordenModel.findByIdAndUpdate(orden._id, {
          $set: {
            estado: 'RECHAZADA',
            observacion: 'Error al obtener SESSION_ID',
          },
        });
        throw e;
      }

      // Llamada saveSolicitud
      const tipoId = cedula.length === 10 ? 'CED' : 'PAS';
      const provinciaCod = Number(solicitud?.provincia) || 17;
      const ciudadCod = Number(solicitud?.ciudad) || 177;
      const codPuesto = this.extractCodPuestoFromCode(stall.code);

      const payloadExterno = {
        SESSION_ID: sessionId,
        COD_EVENTO: 3,
        COD_CAT_NEGO: 13,
        COD_BLOQ: '132',
        CAN_PUESTO: 1,
        SOL_MOTIVO: 'Solicitud uso temporal',
        expositor: {
          id: cedula,
          codEvento: 3,
          nombre: solicitud.nombres,
          tipoId,
          telefono: solicitud.telefono,
          correo: solicitud.correo,
          provincia: provinciaCod,
          ciudad: ciudadCod,
          idRepLegal: '',
          repLegal: null,
          estado: 'A',
          artesano: 'N',
          sorteo: 'N',
        },
        puestos: [
          {
            PUE_ESTADO: 'P',
            NUM_PUESTO: 1,
            COD_PUESTO: codPuesto,
          },
        ],
      };

      const url =
        'https://appbackend.ambato.gob.ec:3002/api/WsFinados/rest/metodo/saveSolicitud';
      const tHttp = Date.now();
      try {
        this.logger.log(`[POSTULAR] → saveSolicitud externo URL=${url}`);
        const resp = await firstValueFrom(this.http.post(url, payloadExterno));
        const dt = Date.now() - tHttp;
        respuestaExterna = resp?.data;
        this.logger.log(
          `[POSTULAR] ← saveSolicitud status=${resp?.status ?? 'n/a'} dt=${dt}ms`,
        );

        await this.ordenModel.findByIdAndUpdate(orden._id, {
          $set: { pagoExterno: respuestaExterna },
        });
        this.logger.debug(
          `[POSTULAR] Orden ${orden._id} almacenó respuesta externa`,
        );

        this.enviarPuesto(
          solicitud.telefono,
          stall.name,
          stall.blockName || '',
        );
      } catch (e: any) {
        const dt = Date.now() - tHttp;
        const status = e?.response?.status;
        const data = e?.response?.data;
        this.logger.error(
          `[POSTULAR] saveSolicitud externo ERROR status=${status ?? 'n/a'} dt=${dt}ms body=${this.s(data)}`,
        );

        // Compensación
        try {
          await this.stallModel.findByIdAndUpdate(stall._id, {
            $set: { estado: 'LIBRE', reservadoHasta: null },
          });
          this.logger.warn(
            `[POSTULAR][compensación] Stall ${stall._id} devuelto a LIBRE`,
          );
        } catch (e2) {
          this.logger.error(
            `[POSTULAR][compensación] Error liberando stall: ${e2 instanceof Error ? e2.message : e2}`,
          );
        }

        try {
          await this.solicitudModel.findByIdAndUpdate(solicitud._id, {
            $set: { estado: 'RECHAZADA' },
            $unset: { ordenId: '' },
          });
          this.logger.warn(
            `[POSTULAR][compensación] Solicitud ${solicitud._id} marcada RECHAZADA`,
          );
        } catch (e3) {
          this.logger.error(
            `[POSTULAR][compensación] Error revirtiendo solicitud: ${e3 instanceof Error ? e3.message : e3}`,
          );
        }

        try {
          await this.ordenModel.findByIdAndUpdate(orden._id, {
            $set: {
              estado: 'RECHAZADA',
              observacion: 'Error en saveSolicitud externo',
            },
          });
          this.logger.warn(
            `[POSTULAR][compensación] Orden ${orden._id} marcada RECHAZADA`,
          );
        } catch (e4) {
          this.logger.error(
            `[POSTULAR][compensación] Error marcando orden rechazada: ${e4 instanceof Error ? e4.message : e4}`,
          );
        }

        throw new BadRequestException(
          'No se pudo crear la solicitud externa (saveSolicitud).',
        );
      }
    }

    // Respuesta final (si es manual, respuestaExterna será null — está en pagoExterno)
    const dtAll = Date.now() - t0;
    this.logger.log(
      `[POSTULAR] OK solicitudId=${solicitudId} orden=${orden._id} tiempoTotal=${dtAll}ms manual=${!!isManual}`,
    );

    return {
      ...(orden.toObject?.() ? orden.toObject() : orden),
      respuestaExterna, // null en manual
    };
  }

  private async fetchDeudas(): Promise<any[]> {
    const url = 'https://appbackend.ambato.gob.ec:3002/mercados/getDeudas';
    try {
      const resp: any = await firstValueFrom(this.http.get(url));
      const data = Array.isArray(resp?.data) ? resp.data : [];
      this.logger.debug(`[DEUDAS] fetchDeudas ok, total=${data.length}`);
      return data;
    } catch (e: any) {
      this.logger.error(
        `[DEUDAS] Error consultando ${url}: ${e?.message || e}`,
      );
      return [];
    }
  }

  @Cron('*/10 * * * *', { name: 'sync-deudas' }) // cada 10 minutos
  async sincronizarDeudas() {
    const lista = await this.fetchDeudas();
    if (!lista.length) return;

    this.logger.debug(`[DEUDAS] Registros recibidos=${lista.length}`);

    for (const item of lista) {
      try {
        // ✅ Solo procesar si el estado es RECAUDADO o PEND_CONCILIACION
        const ESTADOS_VALIDOS = ['RECAUDADO', 'PEND_CONCILIACION'];
        if (!ESTADOS_VALIDOS.includes(item.EST_FACTURA)) continue;

        const cedulaApi = String(item.ID_EXPOSITOR).trim();
        const codPuesto = String(item.COD_PUESTO).trim();

        // 🔎 Buscar stall por code
        const stall = await this.stallModel
          .findOne({
            code: { $regex: `T-${codPuesto}$`, $options: 'i' },
          })
          .lean();

        if (!stall) {
          this.logger.warn(
            `[DEUDAS] No se encontró stall para COD_PUESTO=${codPuesto}`,
          );
          continue;
        }

        // 🔎 Buscar orden activa que coincida con cedula y puesto
        const orden = await this.ordenModel
          .findOne({
            'persona.cedula': cedulaApi,
            stall: stall._id,
            estado: 'EN_SOLICITUD',
          })
          .lean();

        if (!orden) {
          this.logger.debug(
            `[DEUDAS] No hay orden activa para cedula=${cedulaApi}, puesto=${codPuesto}`,
          );
          continue;
        }

        // 🔹 Adjudicar (llama a aprobar)
        this.logger.log(
          `[DEUDAS] Adjudicando orden=${orden._id} puesto=${codPuesto} cedula=${cedulaApi}`,
        );
        await this.aprobar(orden._id.toString());

        // 🔹 Guarda evidencia en la orden
        await this.ordenModel.findByIdAndUpdate(orden._id, {
          $set: { pagoExterno: item },
        });
      } catch (err) {
        this.logger.error(`[DEUDAS] Error procesando item=${item.SOLIC}`, err);
      }
    }
  }

  // === Aprobar (ocupa y programa liberación por fecha) ===
  // src/solicitudes/solicitudes.service.ts
  async aprobar(ordenIdOrReferencia: string) {
    // Si es un ObjectId de 24 hex -> busca por _id; si no, por referencia (p.ej. "0001")
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(ordenIdOrReferencia);
    const filtro = isObjectId
      ? { _id: ordenIdOrReferencia }
      : { referencia: String(ordenIdOrReferencia).padStart(4, '0') };

    const orden = await this.ordenModel.findOne(filtro).lean();

    if (!orden)
      throw new BadRequestException('Orden no existe (ref/id inválido)');
    if (orden.estado !== 'EN_SOLICITUD') {
      throw new BadRequestException('No se puede aprobar en el estado actual');
    }
    if (!orden.stall) throw new BadRequestException('Orden sin puesto');

    // 1) Ocupar el puesto (idempotente/tolerante a 'LIBRE'|'DISPONIBLE'|'RESERVADO')
    const stall = await this.stallModel.findOneAndUpdate(
      {
        _id: orden.stall,
        estado: { $in: ['RESERVADO', 'LIBRE', 'disponible'] },
      },
      { $set: { estado: 'OCUPADO', reservadoHasta: null } },
      { new: true },
    );
    if (!stall) throw new BadRequestException('No se pudo ocupar el puesto');

    // 2) Marcar orden como ASIGNADA (o 'OCUPADA' si tu cron libera por ese estado)
    await this.ordenModel.findByIdAndUpdate(orden._id, {
      $set: {
        // OJO: tu cron libera órdenes con estado 'OCUPADA'.
        // Si quieres compatibilidad directa con revisarExpiraciones(), usa 'OCUPADA' aquí.
        estado: 'ASIGNADA', // <-- cámbialo a 'OCUPADA' si prefieres alinear con el cron
        asignadaEn: new Date(),
      },
    });

    // 3) Marcar solicitud como APROBADA
    await this.solicitudModel.findByIdAndUpdate(orden.solicitud, {
      $set: { estado: 'APROBADA' },
    });

    // 4) Guardar persona a cargo actual EN EL PUESTO (usar $set)
    await this.stallModel.updateOne(
      { _id: stall._id },
      {
        $set: {
          personaACargoActual: {
            nombre: orden.persona?.nombre,
            apellido: orden.persona?.apellido ?? '',
            cedula: orden.persona?.cedula,
            provincia: orden.persona?.provincia ?? '',
            ciudad: orden.persona?.ciudad ?? '',
            telefono: orden.persona?.telefono,
            email: orden.persona?.email,
            codigoDactilar: orden.persona?.codigoDactilar,
            fechaInicio: orden.fechaInicio, // planificada
            fechaFin: orden.fechaFin, // planificada
            fechaFinReal: null, // se llenará al liberar
          },
        },
      },
    );

    return {
      ok: true,
      ordenId: orden._id,
      referencia: orden.referencia,
      estadoOrden: 'ASIGNADA', // o 'OCUPADA' si cambiaste arriba
      stallId: stall._id,
      estadoPuesto: 'OCUPADO',
    };
  }
  async obtenerUltimaEnSolicitudPorStall(
    stallId: string,
  ): Promise<OrdenReserva | null> {
    if (!Types.ObjectId.isValid(stallId)) {
      throw new BadRequestException('stallId inválido');
    }

    const doc = await this.ordenModel
      .findOne({
        stall: new Types.ObjectId(stallId),
        estado: 'EN_SOLICITUD',
      })
      .sort({ createdAt: -1, _id: -1 }) // la más reciente
      .lean<OrdenReserva>()
      .exec();

    if (!doc) {
      throw new NotFoundException('No hay orden EN_SOLICITUD para este stall');
    }

    return doc; // ⬅️ te regresa el documento completo (coincide con tu schema)
  }
  async aprobarManual(ordenIdOrReferencia: string, user: string) {
    // Si es un ObjectId de 24 hex -> busca por _id; si no, por referencia (p.ej. "0001")
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(ordenIdOrReferencia);
    const filtro = isObjectId
      ? { _id: ordenIdOrReferencia }
      : { referencia: String(ordenIdOrReferencia).padStart(4, '0') };

    const orden = await this.ordenModel.findOne(filtro).lean();

    if (!orden)
      throw new BadRequestException('Orden no existe (ref/id inválido)');
    if (orden.estado !== 'EN_SOLICITUD') {
      throw new BadRequestException('No se puede aprobar en el estado actual');
    }
    if (!orden.stall) throw new BadRequestException('Orden sin puesto');

    // 1) Ocupar el puesto (idempotente/tolerante a 'LIBRE'|'DISPONIBLE'|'RESERVADO')
    const stall = await this.stallModel.findOneAndUpdate(
      {
        _id: orden.stall,
        estado: { $in: ['RESERVADO', 'LIBRE', 'disponible'] },
      },
      { $set: { estado: 'OCUPADO', reservadoHasta: null } },
      { new: true },
    );
    if (!stall) throw new BadRequestException('No se pudo ocupar el puesto');

    // 2) Marcar orden como ASIGNADA (o 'OCUPADA' si tu cron libera por ese estado)
    await this.ordenModel.findByIdAndUpdate(orden._id, {
      $set: {
        // OJO: tu cron libera órdenes con estado 'OCUPADA'.
        // Si quieres compatibilidad directa con revisarExpiraciones(), usa 'OCUPADA' aquí.
        estado: 'ASIGNADA', // <-- cámbialo a 'OCUPADA' si prefieres alinear con el cron
        asignadaEn: new Date(),
        usuario: user,
        manual: true,
      },
    });

    // 3) Marcar solicitud como APROBADA
    await this.solicitudModel.findByIdAndUpdate(orden.solicitud, {
      $set: { estado: 'APROBADA', usuario: user, manual: true },
    });

    // 4) Guardar persona a cargo actual EN EL PUESTO (usar $set)
    await this.stallModel.updateOne(
      { _id: stall._id },
      {
        $set: {
          personaACargoActual: {
            nombre: orden.persona?.nombre,
            apellido: orden.persona?.apellido ?? '',
            cedula: orden.persona?.cedula,
            provincia: orden.persona?.provincia ?? '',
            ciudad: orden.persona?.ciudad ?? '',
            telefono: orden.persona?.telefono,
            email: orden.persona?.email,
            codigoDactilar: orden.persona?.codigoDactilar,
            fechaInicio: orden.fechaInicio, // planificada
            fechaFin: orden.fechaFin, // planificada
            fechaFinReal: null, // se llenará al liberar
          },
        },
      },
    );

    return {
      ok: true,
      ordenId: orden._id,
      referencia: orden.referencia,
      estadoOrden: 'ASIGNADA', // o 'OCUPADA' si cambiaste arriba
      stallId: stall._id,
      estadoPuesto: 'OCUPADO',
    };
  }

  // === Rechazar (libera inmediatamente) ===
  async rechazar(ordenId: string) {
    const orden = await this.ordenModel.findById(ordenId);
    if (!orden) throw new BadRequestException('Orden no existe');
    if (orden.estado !== 'EN_SOLICITUD')
      throw new BadRequestException('No se puede rechazar');

    await this.ordenModel.findByIdAndUpdate(ordenId, {
      $set: { estado: 'RECHAZADA' },
    });
    await this.stallModel.findByIdAndUpdate(orden.stall, {
      $set: { estado: 'LIBRE', reservadoHasta: null },
    });
    await this.solicitudModel.findByIdAndUpdate(orden.solicitud, {
      $set: { estado: 'RECHAZADA' },
    });

    return { ok: true };
  }

  // === Cron Job: cada 10 minutos ===

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'solicitudes-every-minute' })
  async revisarExpiraciones() {
    const ahora = new Date();
    this.logger.debug(`Revisión de expiraciones @ ${ahora.toISOString()}`);

    // ------------------------------------------------------------------
    // 1) Órdenes EN_SOLICITUD vencidas (no se aprobaron a tiempo)
    // ------------------------------------------------------------------
    const vencidas = await this.ordenModel
      .find({ estado: 'EN_SOLICITUD', aprobarAntesDe: { $lte: ahora } })
      .select({ _id: 1, stall: 1, solicitud: 1 })
      .lean();

    for (const o of vencidas) {
      const updated = await this.ordenModel.findOneAndUpdate(
        { _id: o._id, estado: 'EN_SOLICITUD' },
        { $set: { estado: 'VENCIDA', vencidaEn: ahora } },
        { new: true },
      );
      if (!updated) continue;

      // Libera puesto si quedó RESERVADO
      await this.stallModel.findOneAndUpdate(
        { _id: o.stall, estado: 'RESERVADO' },
        { $set: { estado: 'LIBRE', reservadoHasta: null } },
      );

      // La solicitud puede quedar en EN_SOLICITUD (usuario podría reintentar)
      // o en EXPIRADA si quieres bloquear.
      await this.solicitudModel.findByIdAndUpdate(o.solicitud, {
        $set: { estado: 'EN_SOLICITUD' },
      });
    }

    // ------------------------------------------------------------------
    // 2) Órdenes OCUPADAS (o ASIGNADAS) cuyo periodo de uso terminó
    //    *Si tras aprobar usas 'ASIGNADA', agrega ese estado aquí*
    // ------------------------------------------------------------------
    const paraLiberar = await this.ordenModel
      .find({
        estado: { $in: ['OCUPADA'] }, // o ['ASIGNADA','OCUPADA'] si usas ASIGNADA
        $or: [{ liberarEn: { $lte: ahora } }, { fechaFin: { $lte: ahora } }],
      })
      .select({
        _id: 1,
        stall: 1,
        solicitud: 1,
        persona: 1,
        fechaInicio: 1,
        fechaFin: 1,
      })
      .lean();

    for (const o of paraLiberar) {
      const updated = await this.ordenModel.findOneAndUpdate(
        { _id: o._id, estado: { $in: ['OCUPADA'] } }, // o incluye 'ASIGNADA'
        { $set: { estado: 'LIBERADA', liberadaEn: ahora } },
        { new: true },
      );
      if (!updated) continue;

      // Cierra al responsable actual y lo empuja al historial
      await this.stallModel.updateOne(
        { _id: o.stall },
        {
          $set: {
            estado: 'LIBRE',
            reservadoHasta: null,
          },
          $push: {
            personasCargo: {
              nombre: o.persona?.nombre,
              apellido: o.persona?.apellido ?? '',
              provincia: o.persona?.provincia ?? '',
              ciudad: o.persona?.ciudad ?? '',
              cedula: o.persona?.cedula,
              telefono: o.persona?.telefono,
              email: o.persona?.email,
              codigoDactilar: o.persona?.codigoDactilar,
              fechaInicio: o.fechaInicio,
              fechaFin: o.fechaFin,
              fechaFinReal: ahora,
            },
          },
          $unset: {
            personaACargoActual: '', // limpia el actual
          },
        },
      );

      // Marca la solicitud como FINALIZADA (o el estado final que manejes)
      await this.solicitudModel.findByIdAndUpdate(o.solicitud, {
        $set: { estado: 'FINALIZADA' },
      });
    }

    // ------------------------------------------------------------------
    // 3) Limpieza de RESERVAS vencidas (huérfanas)
    //    - Libera stalls RESERVADO con reservadoHasta vencido
    //    - Sincroniza órdenes EN_SOLICITUD cuya aprobación expiró
    // ------------------------------------------------------------------
    // libera stalls
    await this.stallModel.updateMany(
      { estado: 'RESERVADO', reservadoHasta: { $lte: ahora } },
      { $set: { estado: 'LIBRE', reservadoHasta: null } },
    );

    // y de paso marca órdenes EN_SOLICITUD con aprobarAntesDe vencido
    await this.ordenModel.updateMany(
      { estado: 'EN_SOLICITUD', aprobarAntesDe: { $lte: ahora } },
      { $set: { estado: 'VENCIDA', vencidaEn: ahora } },
    );
  }
  /* 
  private parseDataUrl(b64: string): { mime: string; raw: string } {
    const match = /^data:(.+);base64,(.*)$/i.exec(b64);
    if (match) return { mime: match[1], raw: match[2] };
    return { mime: 'image/jpeg', raw: b64 };
  } */

  async subirPdfYObtenerRespuesta(): Promise<any> {
    const { mime, raw } = this.parseDataUrl(this.HARDCODED_PDF_BASE64);
    const buffer = Buffer.from(raw, 'base64');

    const form = new FormData();

    // 👇 igual que en el front
    form.append('imagenes', buffer, {
      filename: 'documento.pdf',
      contentType: mime || 'application/pdf',
    });
    form.append('ids', 'rec_1'); // 👈 aquí simulas el inputName que manda Angular

    const url = 'http://appbackend.ambato.gob.ec:3002/upload-unique';

    // Logs de lo que se envía
    this.logger.debug(`➡️ URL destino: ${url}`);

    try {
      const resp: any = await firstValueFrom(
        this.http.post(url, form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
           httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        }),
      );

      const data = resp?.data || {};
      this.logger.log(`Respuesta upload-unique: ${JSON.stringify(data)}`);

      const objectData =
        typeof data?.objData === 'string'
          ? JSON.parse(data.objData)
          : (data?.objData ?? data);

      // intenta en objData y luego en el nivel raíz
      const idSession =
        objectData?.SESSION_ID ||
        data?.SESSION_ID ||
        data?.sessionId ||
        data?.session_id ||
        null;

      console.log('SESSION_ID:', idSession);
      return idSession;
    } catch (e: any) {
      this.logger.error('Error subiendo PDF', e?.response?.data || e);
      throw new BadRequestException('No se pudo subir el PDF a upload-unique');
    }
  }

  private readonly baseUrl = 'https://hugerapp.com/api/puestocomerciante';
  private readonly authToken =
    'uCpWPLZgIuq4WJVo7f3u6U8utQbOIfjEQ36jtY95XOhTLkvhq8JMat2lVQj4lTTs';
  async enviarPuesto(
    identificacion: string,
    puesto: string,
    ubicacion: string,
  ): Promise<{ ok: boolean; status?: any; message?: string }> {
    const id = (identificacion || '').replace(/\D/g, ''); // solo dígitos
    if (!id) {
      this.logger.warn('Identificación vacía; se omite envío.');
      return { ok: false, message: 'identificacion vacía' };
    }

    const url = `${this.baseUrl}/${id}`;
    const body = new URLSearchParams();
    body.set('puesto', String(puesto ?? '').trim());
    body.set('ubicacion', String(ubicacion ?? '').trim());

    try {
      const resp = await firstValueFrom(
        this.http.post(url, body.toString(), {
          headers: {
            Authorization: this.authToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15_000,
        }),
      );
      const data = resp?.data ?? {};
      const ok = !!data?.status;
      this.logger.log(
        `[PuestoComerciante] → OK id=${id} puesto=${puesto} ubicacion=${ubicacion} msg=${data?.message ?? ''}`,
      );
      return { ok, status: resp?.status, message: data?.message };
    } catch (e: any) {
      const status = e?.response?.status;
      const data = e?.response?.data;
      this.logger.error(
        `[PuestoComerciante] ERROR id=${id} puesto=${puesto} ubicacion=${ubicacion} status=${status} body=${JSON.stringify(
          data ?? {},
        )}`,
      );
      return { ok: false, status, message: data?.message ?? 'error' };
    }
  }

  private readonly HARDCODED_PDF_BASE64 =
    'JVBERi0xLjMKJf////8KMTAgMCBvYmoKPDwKL1R5cGUgL0V4dEdTdGF0ZQovY2EgMQo+PgplbmRvYmoKMTEgMCBvYmoKPDwKL1R5cGUgL0V4dEdTdGF0ZQovY2EgMQovQ0EgMQo+PgplbmRvYmoKMTQgMCBvYmoKPDwKL1R5cGUgL0V4dEdTdGF0ZQovQ0EgMQo+PgplbmRvYmoKOSAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDEgMCBSCi9NZWRpYUJveCBbMCAwIDU5NS4yOCA4NDEuODldCi9Db250ZW50cyA3IDAgUgovUmVzb3VyY2VzIDggMCBSCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9Qcm9jU2V0IFsvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJXQovRXh0R1N0YXRlIDw8Ci9HczEgMTAgMCBSCi9HczIgMTEgMCBSCi9HczMgMTQgMCBSCj4+Ci9Gb250IDw8Ci9GMSAxMiAwIFIKL0YyIDEzIDAgUgo+PgovQ29sb3JTcGFjZSA8PAo+Pgo+PgplbmRvYmoKNyAwIG9iago8PAovTGVuZ3RoIDMxMzEKL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCnic3V1LbyO5Eb7rV/QfWA6r+AYGPuwmWWAPAZKd22IPfshBgkyAZIDk76eKTbbYMkVRM243x5NoZZXk1ldkvauahknS/34A+o/XIHyYHj8fYPrf4bffifR0kNM/6PHLQQUtrLfWugmsEgrQTGBQyKDo3wSBflVaIv7nePjwh+N///54/OvPP06PX+hiUgQrndcKlEOjg8RI0k4a71EZDBpw+vL4r8OHn7/A9Lcvh+caBAQnTPq6nSBoKczbfDn9hPzT+loy7hZ/8vnwb77yy7378VOiw6Tl5KQTEOjLYfr0+fDhTzCBnz49H377KKUEftxNSGAIYNATE5Eeih6aHoZf300ghdMI3scPWHo4enh6hLtJ/j59+uXwx0+Hv7wKZjAEWBptQxv7fYKo7qYfvHBx8Rd4kN58oDetUNpZY5c3Xx8zaiVAoQfVxvyYYDlaUi3ASkiwnuhx5DdrzLw+XkWKFCQo0uWr8hGXkR7PBC0IXkiS8QVzDzShzv5NfaQbpNwGEAZ42WYukER2xcVKqO+mFSN23pH9GXFOkEWgvWjz40fB61G44LzBNl6SX01K6K2DMGXVfUjqwD8/3bH5NNGkfkybdMwq3sWoL40rBEtcyWRXwWU7y8Tzz/Wyao0InvbGTNZq+jrUiAursLD6nGwqzOgBZ25AdW/Z5pyQbRUYwOgmJ8CoTfFs089k+MGn12vDVPWWJ19JQUU4ectM/We5AD/9+i0L8OtPf+ZVVbyqvzZ8Nwo/45lfe0VK9+ZYeC2WUGZBVFL3wcU7Rt+MsrJnJ/pmiHbTCnQodABFzq+pFvfsO9A5pWOwBMlD8vNISq4ksYOa/t9mhzX74ZoWc9h9rrefD8oGAWf5wFtK6ioZWDSopO6jQbwuS5604Cqp++Aqd7HU8HIf37OG028JT2mFg7ZKUFACFNrC8WWUOJKGawsClTbX/PhzzN7QKI7NPs68cTQcnx/mwDgGY/aaGeACwLnCfz7Qigr0+5iAVUnipGoFdR9V4zVxvsSUKTuZpGLnStXPe/eu1Z6SQwQhjZZWLSkuLvqRonXgKgcIB95FdWdV53i3L/neng1HO0j702Qlh+kuheoqherMXsghfEfIjqiy4SMZsSvCSwGxUgUEQxqHThsZiMv0k0/vRFLxmj7pO8Vj4wSWmDWBdk+zUi4rKstob208eQkfkpOAbunYmAty4BqiTDSZeZrxj4HZYy6XNjFn8eU1P7I3S882vfdCa7t4gwonfbTudILib+P1ZHwQgXKo4Cqu2XVHE28AmJZRB221aWLOkYITiuKNuZyDMBIfHOWB96wMrbXPpQ3daxO5Kp1MIpA75c090V5YxYimowhwfiGyt8awT77t2juaT8qbg7E6F/5K7Y3VMD1XwaIWP6UQeggL5DhgJV/qmjxky8NhcrQ8fdjf0MIQeIneugu5DBJyJLMIShd1C8nxwD29o/kTPfLvjJDasp0tFOBErMQFZ/+mPlK/0pSIstZsDmhHTSMWpTVlo+Y7DlRazIwaqLQwu7O6oJ39YjQZ2QRy1w+FDYYygDGjFUNZhvJS1zwmWQw0I3l6cMI6S0vexI12lih0qZ09DH4i2iCDurLuRRMGfY+lDuTN1NpOZ9IOVvqEJtvojcHsaKEVxWzOcE//hYFgNxyTcDjFQ6hSku5SZjOMoaYtUtaD1U2exjLU3Nf0Wjt0bdDvw1IrK1C7askXc2x3P0bpijVDaqEJV61sxVMAS6kqZwoP9YrcKNW4wKbbIdmeFmc4UP2QFlUYY62GJuScoi2Fllx4CelZdXggpUmN55hprh8WhHdXP9QUICJitXzFgy2ryZd5amIOpBbr7we0L9qDIOGr1070DBofEiN+psXnh5l+vanMcmKNcMvkwxwvnGjfWFMpL54ij9uuvaNIWU2/D/WaSraWru7KxpMkq4SWqlqfwMei/2jmoa/4OvthTENgmOh5YCzPJLLvfkr0NGoVCzX8+eN8/Tjd11PhUF5RPgHrCkdBfPvYeYUoy/DmgHaUe7KVWst6gp3rbzWZfyjqdLEzMJoOaCMMaW01v6MozQvSaGY7D0emGYSlP98/ofoWeStJpw1X2Zr3gtPumH4/j8aGp9/WaMIVPnqbplqCOOsPLKS3Nx0FmmQ4tgazo9lAT6GtrGZ7UZOOJzGc2xCjiGA2D+go5L0wUXx1eL1HNiEIbdQ60iqIO8hniShL6OaAdpRR4BSG6wkXSkO1isOqyZr9ny+SMhhNkCWJpgJX7Ry/h7sAOEx0TgRQWvl6KSNammU84cUmXVBQa0WZMJ9ev7t8WZGyO3mhYfyUBNuM1Ci2PEodI+4W9rGKoc4QzbOQNjE/XJXX/Y2KMlo4V29w84QBywlHmwrOb6qjnVAUGrhsQ+VQgypkDL1VXGFpcahoSxSxqDQ/93CIPSU6HVBgOGvnF8RvLL6sLp/d+21X39FCKSc81Pu80cKnjmKMK2EkS+W0QGAP2+Qhhg+5nltq/jDWC6Qln2aCazPCBcdTPazS1hltVkcp0nlf7/Mq06G2hsLIswrVQnr7IL5Ak3R8azA7GgUKTQNe6u3eTUYoB+kO+qXH6+RpajVX+o8jGYwAwgUIAZv85dBmMRyQEhYnzFxPz0w/DViAVuBFCPVWqbJyNQqq8uj8OPkGeu5lX2idUspktQhxqGrZBMet37RjeNNUweb8cM1NSW9Ck63cUIo6kx1VznnxVMwZhSuSUQEY64dNtkZqBxMx+FhyakFeSmYX7o7BnjvAjXGC848luy0I7y69RdZHd6EdfH9ZpseZ/eHUce5GtHhZJjVeWJvBzD8zIfWFTjYFj6pnps54JeRZ/fRE+8Zkqbx4jqNuuvaO0q6dkP5Cp3rwYk4L+6jFnCbm70YjtRVg6hMBsdwRZgaq5Q5Y2t+pcj5QQQe5fWExtDm8Tw4gh5w9kzK0lRSdn2V+BfHtc78VomS1tge0o6XDcH5M1snSObkMzcXhp0otYhBL4oXyyhG9xU8uCo2B+ZSjNjF/N9YPvUBbHzbgkUAu36IViq1cPG6PXad6LKrA8vw8PuDi92jW0Kk4IsthZIPjWMBX1eI9EZ9mJ7A+Ea+nn2Yp5z8bLFxIO9jKE5psKTcGs6OdpDSRTWF1GCOP2uei86h9bAIp1IUDVVgFc0u6bNCr4/o1t6/V8/zZeSaxR26VzeeDFJJ7Iu4guyWiLL2bA9pPfiHwuGp9UEPmwWeo+/hcsxrDbzqKQedIucVTrE1nfdSpthYPDBlMJ/kgOu3rsyVcxl2KhpfLuBd0zmg+MWwdWi+0HTSuwJMVbms4O+qbM6uDQ9fnB5zp2DLAN4qOWU2GEEH7Jh9Y3tlUqc4P16cEx/IGUD1ToOvIQNYrPlHR6zPFOhF30KwSUVatzQHtqFtcZ0eP1Zw1ySD7Mkz3kpwNII6iZDzVILkA1mRorJKdJ6De8OEiTczfS9JK4TwZunhYSk8Rfc9+KaAWdBUKfC4c9tbVyM6ZSe7a994F4LiNngyMLV6+bZ8rrsYtayZBuAt3E3O6w53LeBOHTblMdsIPxT1curf6cBM6hqaR6z9tlJDQPZ7uHtP46mgMEYEisWCaaLga0zWYT/st+M8GpOOoab9J2AviV3aWKldaHN6NV38lCfNKeGOrwTvLTT50tZwF/7oj+m8C5sn3U65ABqKBbxH21//+4MizxfCx8f3xxkg999P4LqqIJdE2EXFLRpmMl2kuSlfnlK9oQuoNvPy7KN/oED5c+VMpwOaj/8RsChJ5WUkWJDtvHbJmw9kdq+xGutv1t4EgtskTSYOuiSK6p3z7+HLqZ82PoUynl62LU1vB57PIuB2i2vBvCdVuROCt8Bi/tokgyNtOeL0NBZ+wgFbzIYRNFCkUWWoutSmbPEMIKRLJkzc9N7HdqAFOCkcayX/Exnvyc9H6ZtS2vLNzmV655XixW1VBCYOxx9FEs6EsKSOk1/YKAjzK3kNktoEZvAg6nqq200IZlMJIctZtBB13R+14dhNwrK0CZF8XyoJ/Dnbjc+U+tagDtx0Qv3UCygNEJh7nepGz6Dr6j0TbGDHFCcprdK6B+CsPc9sYOQAZCoWILeiNc9x2gm14XMPzoUAN2FqtZ9u1Toos092b3Wnf5uwoiieN9BJauxDGgUuWUvMfjWvBvSn32ByykYI9cmgblRXU/wMX21Y6CmVuZHN0cmVhbQplbmRvYmoKMTcgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAxIDAgUgovTWVkaWFCb3ggWzAgMCA1OTUuMjggODQxLjg5XQovQ29udGVudHMgMTUgMCBSCi9SZXNvdXJjZXMgMTYgMCBSCj4+CmVuZG9iagoxNiAwIG9iago8PAovUHJvY1NldCBbL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSV0KL0V4dEdTdGF0ZSA8PAovR3MyIDExIDAgUgovR3MzIDE0IDAgUgovR3MxIDEwIDAgUgo+PgovRm9udCA8PAovRjEgMTIgMCBSCi9GMiAxMyAwIFIKPj4KL0NvbG9yU3BhY2UgPDwKPj4KPj4KZW5kb2JqCjE1IDAgb2JqCjw8Ci9MZW5ndGggMTYzMwovRmlsdGVyIC9GbGF0ZURlY29kZQo+PgpzdHJlYW0KeJzVWttuGzcQfddX7A+EmRkOb4CRh6RtgDwUaOO3IA+2JBctmgKtgfb3O0NytSt7Q68Db8XaWK9EydIZ8syZC4kDyO8rlD+R0cQ07L/sXr+/p+GX+93r745//7o//vz+7bC/34GJIbJFG8hxAkx+AANkHSVGDJ4DuBhJBx++737/x+5u9+cOl77t7XUdx4FhCAQmuIAxDteC5AcckIbru92nKwBgACK5pzcDfB6uP+y+v979dDm4jg3YBN42URP3g9iTjMn/xiZiPMh1lEuQo5PL1sc6RuVO8GYIxhITpkH/x55ZiMM/u0+f5TsPOxh+k+vDThYXSWbMkxu+7JyfPf19PhPvPspMeJlYQuejp8AOkhhdH8X6Sh6aPZd3xuHjux91cq1O7sevTrN98DOsG3oGi32KxjmZPH+aXfhGFm8M1qHxKekitjArC+hOrlt5nCoT9DGusgEXEK8bW2sGARkXWYwIQhRhJRUjaECcG5FprAugBvh6d/Wqz9VIul1DZ06GncVMaEycEcwGH9E6gz3n6MInL3yS+ItzRgj+zE+/oAdEdc8kUJc9AG7UC3pjT0gmWAwpPGZPdllXxJH2VSR1LPRihPXGheAdNe3AfWE5oN7XsNyLzrMNZyQ/jS1I94OfYd3QereY4Rm9Yms4F/QjCdnBR8kyFvzIqx/1Qr/Rh7y8qPnKggIr55R/OYTEek8llPTjRyKxyQoubNrSvx5EaxLZyO01eb4eRPG5R4IwDV5AEeaIRknYHNAFNYFZSwWKS7GVapZ2ytDqXRMbX9yuj8wzehPRswhb0x7uMU9gcS0Hjhfiq63JDfB5gWSP58/VMHtXEyEo2mFDT/ohjhQgsVSIL2WvErAf+0Q9fCRk17QPYkeYpRAXcWNMbcwoSUEyFIIV8b8q8amsURGEnDgcVmg9gTXn5c048t+r/ISlSvzGUC6o7+RNipLJL+V8uoyxEzqe9FAAg0tpqeqmVPQNbifusetNC5z4FWNA17Ql56q8xm8IjXZSzl1nGryA98wRjQ60OaAL+hAkAynAYv8hlM7VPDxpP9NLEZm97qo2g7DmT4faA+2GrqPfQTToEy3V+aC5xbHofDJqlizzWDRSMaof/9NgBjZS26axVjx18B7d1/imjfJdD1zzNHYBz5zhGR1zaziX80uX0BDktH+xn6E+Nk9drLI1zPYefKUA1XF5PwbjQsTC7+5a0i5JbAnRLzZEuDoj1qptTduZnDch+XhWgM8GL0DhOaKRw5sDuiCJgzUWlXPLBXjeZchkFgKv4+PGoL3oa0icqI19DHq1UYC9Fd4ukLExwmIhqkWO16g+SgH7qbTOrTlZFpYloTiFjX5CoJfllQQ0xbaVUtq9iiZoR5iG/0t+bVEHESm1jRNfQZbwn3chr0qnCpMpG15XPRlEUbe3/BOcLAXDxDbuqpkgQi1TLbraMmHOrxKiejNDMgqIQXdImktxnPDbnvYbGJ1hHyxgE3/uz4ea9NT8ndQ9ZBGtD/UUhib1kjLxuGhuUjwNRqct71Amo5tJOAm8S4ZTWNy/tzfFMHt4pBJF/cn21kLlYBJ5SWabhuVcVsPTzXmp1leJpnus4HxsrxFPO2J8U6JRV95mgSUtlSqkzbU11bM61tMVaU+2J2+YI7n2GuqOYE6VbmuBcqj0/KqQPFW06Ne7lMsCD8Nfx5c9+CYTijqhd1+ZWslw5Xf9JLFR2aQhQjAS4E+dQJxHxX3dzcaV22nPAyFmS0kLjkITRWaerZcba45HBXHj1N5G8CWO5TabbcM/FMhbINDdRcpf20SQptONG6BwIjbkBcsT81B7Gjm0Yym7hAABtXi+GnuPtQeCtTSrqOnw4qglhEp9IfyxQ4jRoMviN6L20ybTbJd5v6ErWOOI9KBqE82GXLJOEkz2TyA4HSlEmE7PUnVIMl7PwtlxObeAmaJJzPk48mUmyhEYBxIr2whgX6l+6jKs7tothMM1Q89p7aCeKpaaYoyL6WFqkwvtQ0kNzmrT2eZqXuJ1YX9jk6I1YJ1n17BsPADbB2LJE2xkCqGBOJ9kORQaQTfIUWoxsETUgn46haw5xrqN3I1hCxCTojirb8Bm+2Zw2qCClPvyzNWRa2sA1ie6W5tjJZ90EAGfWIVe4IpSSpCT3LgBF59VDW4NWXfLJSKntqicQf0XCl8oWgplbmRzdHJlYW0KZW5kb2JqCjE5IDAgb2JqCihwZGZtYWtlKQplbmRvYmoKMjAgMCBvYmoKKHBkZm1ha2UpCmVuZG9iagoyMSAwIG9iagooRDoyMDI1MDkyMjIwMTIxMFopCmVuZG9iagoxOCAwIG9iago8PAovUHJvZHVjZXIgMTkgMCBSCi9DcmVhdG9yIDIwIDAgUgovQ3JlYXRpb25EYXRlIDIxIDAgUgo+PgplbmRvYmoKMjMgMCBvYmoKPDwKL1R5cGUgL0ZvbnREZXNjcmlwdG9yCi9Gb250TmFtZSAvQlpaWlpaK1JvYm90by1NZWRpdW0KL0ZsYWdzIDQKL0ZvbnRCQm94IFstNzMxLjQ0NTMxMiAtMjcwLjk5NjA5NCAxMTcyLjM2MzI4MSAxMDU2LjE1MjM0NF0KL0l0YWxpY0FuZ2xlIDAKL0FzY2VudCA5MjcuNzM0Mzc1Ci9EZXNjZW50IC0yNDQuMTQwNjI1Ci9DYXBIZWlnaHQgNzEwLjkzNzUKL1hIZWlnaHQgNTI4LjMyMDMxMwovU3RlbVYgMAovRm9udEZpbGUyIDIyIDAgUgo+PgplbmRvYmoKMjQgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL1N1YnR5cGUgL0NJREZvbnRUeXBlMgovQmFzZUZvbnQgL0JaWlpaWitSb2JvdG8tTWVkaXVtCi9DSURTeXN0ZW1JbmZvIDw8Ci9SZWdpc3RyeSAoQWRvYmUpCi9PcmRlcmluZyAoSWRlbnRpdHkpCi9TdXBwbGVtZW50IDAKPj4KL0ZvbnREZXNjcmlwdG9yIDIzIDAgUgovVyBbMCBbOTA4IDU0MC4wMzkwNjMgNjU0LjI5Njg3NSA4NzQuNTExNzE5IDI4My4yMDMxMjUgNjgxLjE1MjM0NCA2NjMuMDg1OTM4IDcwOS40NzI2NTYgNjg4Ljk2NDg0NCAyNDguNTM1MTU2IDYwNS40Njg3NSA2MDMuMDI3MzQ0IDY1Mi44MzIwMzEgNjA5LjM3NSA3MDkuNDcyNjU2IDU2NC45NDE0MDYgNjUyLjgzMjAzMSA1MzkuMDYyNSAzMzMuMDA3ODEzIDU2Ny4zODI4MTMgNTE0LjY0ODQzOCA1NjIuMDExNzE5IDUzNS42NDQ1MzEgMzUzLjUxNTYyNSA1NTYuNjQwNjI1IDI1NC44ODI4MTMgNTUwLjc4MTI1IDUyMS45NzI2NTYgNTU1LjY2NDA2MyA1NjMuNDc2NTYzIDI1NC44ODI4MTMgODcxLjA5Mzc1IDQ5Ni4wOTM3NSA1NjYuODk0NTMxIDYzOC4xODM1OTQgMzUzLjAyNzM0NCA0ODkuNzQ2MDk0IDUzNS42NDQ1MzEgNTY3LjM4MjgxMyA1NTYuMTUyMzQ0IDM0Ni4xOTE0MDYgMzQ5LjYwOTM3NSAyNTAuOTc2NTYzIDU2Mi4wMTE3MTkgMjY1LjEzNjcxOSAyNjQuNjQ4NDM4IDYyOS4zOTQ1MzEgNTU2LjE1MjM0NCA1NjUuOTE3OTY5IDMzOS44NDM3NV1dCi9DSURUb0dJRE1hcCAvSWRlbnRpdHkKPj4KZW5kb2JqCjI1IDAgb2JqCjw8Ci9MZW5ndGggMzM1Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCj4+CnN0cmVhbQp4nF1Sy26DMBC88xU+poeIQoLdSgipSi8c+lBpT1UPjr2OkIqxDDnw9zUeN6mKBKPZ3Zlds84P7WNr+5nlr35UHc3M9FZ7msazV8SOdOptVpRM92pOLH7VIF2WB3G3TDMNrTUjq+uMsfwtpKfZL2zzoMcj3ayxF6/J9/bENh+HLka6s3PfNJCd2W3WNEyTCXZP0j3LgVgepdtWh3w/L9ugula8L45YGXmBkdSoaXJSkZf2RFl9G56mNuFpMrL6XzqJjuZvNQuwKxr2eaV7FaGqwDTgHiAABYAAJkIJebUDSOQS24PdAZI1ghxmIjGYCegEPDkEogRDW4459xwMAo4OPJlhao4ziFSJM1TJGkGBSgKY1B1tS3iWyQwH45hFYvgSUCFoUCJSTjdf6zp+f/y6mfUWXbauzt6HhcerFje97ri3dLmNbnSrKr4/ZOS6MAplbmRzdHJlYW0KZW5kb2JqCjEyIDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMAovQmFzZUZvbnQgL0JaWlpaWitSb2JvdG8tTWVkaXVtCi9FbmNvZGluZyAvSWRlbnRpdHktSAovRGVzY2VuZGFudEZvbnRzIFsyNCAwIFJdCi9Ub1VuaWNvZGUgMjUgMCBSCj4+CmVuZG9iagoyNyAwIG9iago8PAovVHlwZSAvRm9udERlc2NyaXB0b3IKL0ZvbnROYW1lIC9DWlpaWlorUm9ib3RvLVJlZ3VsYXIKL0ZsYWdzIDQKL0ZvbnRCQm94IFstNzM3LjMwNDY4NyAtMjcwLjk5NjA5NCAxMTQ4LjkyNTc4MSAxMDU2LjE1MjM0NF0KL0l0YWxpY0FuZ2xlIDAKL0FzY2VudCA5MjcuNzM0Mzc1Ci9EZXNjZW50IC0yNDQuMTQwNjI1Ci9DYXBIZWlnaHQgNzEwLjkzNzUKL1hIZWlnaHQgNTI4LjMyMDMxMwovU3RlbVYgMAovRm9udEZpbGUyIDI2IDAgUgo+PgplbmRvYmoKMjggMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL1N1YnR5cGUgL0NJREZvbnRUeXBlMgovQmFzZUZvbnQgL0NaWlpaWitSb2JvdG8tUmVndWxhcgovQ0lEU3lzdGVtSW5mbyA8PAovUmVnaXN0cnkgKEFkb2JlKQovT3JkZXJpbmcgKElkZW50aXR5KQovU3VwcGxlbWVudCAwCj4+Ci9Gb250RGVzY3JpcHRvciAyNyAwIFIKL1cgWzAgWzkwOCA2NTIuMzQzNzUgODc2Ljk1MzEyNSA1NjEuNTIzNDM4IDU0My45NDUzMTMgMzI3LjE0ODQzOCA1NzAuMzEyNSAyNDguMDQ2ODc1IDI2MS4yMzA0NjkgNTk2LjY3OTY4OCA1NTEuMjY5NTMxIDU1Mi4yNDYwOTQgNTYxLjUyMzQzOCAzMzguODY3MTg4IDU1MC43ODEyNSA2NTAuODc4OTA2IDUzMC4yNzM0MzggNTYzLjk2NDg0NCAyNDMuMTY0MDYzIDI0Mi4xODc1IDU2Mi4wMTE3MTkgNTYyLjAxMTcxOSA1NjIuMDExNzE5IDU2Mi4wMTE3MTkgNTYyLjAxMTcxOSA1NjIuMDExNzE5IDU2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IG4gCjAwMDAwMDM5MjggMDAwMDAgbiAKMDAwMDAwMzc1NSAwMDAwMCBuIAowMDAwMDAzNjQyIDAwMDAwIG4gCjAwMDAwMDU3MjMgMDAwMDAgbiAKMDAwMDAwNTYzNSAwMDAwMCBuIAowMDAwMDA1NjYxIDAwMDAwIG4gCjAwMDAwMDU2ODcgMDAwMDAgbiAKMDAwMDAwOTQ3OSAwMDAwMCBuIAowMDAwMDA1Nzk5IDAwMDAwIG4gCjAwMDAwMDYwNjYgMDAwMDAgbiAKMDAwMDAwNjgxNyAwMDAwMCBuIAowMDAwMDE2ODY5IDAwMDAwIG4gCjAwMDAwMDczNzMgMDAwMDAgbiAKMDAwMDAwNzY0MSAwMDAwMCBuIAowMDAwMDA4NjY0IDAwMDAwIG4gCjAwMDAwMjY5MzYgMDAwMDAgbiAKMDAwMDAzMDQxNSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDMyCi9Sb290IDMgMCBSCi9JbmZvIDE4IDAgUgovSUQgWzxjMTI4Y2ViODQ5OWRjNTdlZjU1MDhmYTM1ZmRiZGE2OD4gPGMxMjhjZWI4NDk5ZGM1N2VmNTUwOGZhMzVmZGJkYTY4Pl0KPj4Kc3RhcnR4cmVmCjMzODk0CiUlRU9GCg==';

  private parseDataUrl(b64: string): { mime: string; raw: string } {
    const m = /^data:(.+);base64,(.*)$/i.exec(b64);
    if (m) return { mime: m[1], raw: m[2] };
    // por defecto PDF
    return { mime: 'application/pdf', raw: b64 };
  }
  // 🔥 Aquí pegas tu imagen base64 (puede tener o no el prefijo data:image/...)
}
