// src/solicitudes/solicitudes.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Solicitud } from './schemas/solicitud.schema';
import { OrdenReserva } from './schemas/orden-reserva.schema';
import { Stall } from 'src/stalls/entities/stall.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
@Injectable()
export class SolicitudesService {
  private readonly logger = new Logger(SolicitudesService.name);

  constructor(
    @InjectModel(Solicitud.name) private solicitudModel: Model<Solicitud>,
    @InjectModel(OrdenReserva.name) private ordenModel: Model<OrdenReserva>,
    @InjectModel(Stall.name) private stallModel: Model<Stall>,
    private readonly http: HttpService,
  ) {}

  async crearSolicitud(dto: any) {
    try {
      const fechaInicio = new Date(dto.fechaInicio);
      const fechaFin = new Date(dto.fechaFin);
      if (fechaFin < fechaInicio)
        throw new BadRequestException('fechaFin < fechaInicio');

      // 1) Buscar puesto y validar estado LIBRE
      const stall = await this.stallModel.findById(dto.stallId).lean();
      if (!stall) throw new BadRequestException('Puesto no existe');
      if (stall.estado !== 'LIBRE' && stall.estado !== 'disponible') {
        throw new BadRequestException('El puesto no está disponible');
      }

      // 2) (Opcional) denormalizar market/section desde el stall
      const marketId = stall.market as unknown as Types.ObjectId;
      const section = stall.section || null;

      // 3) Crear solicitud referenciando el puesto
      return this.solicitudModel.create({
        stall: new Types.ObjectId(dto.stallId), // 👈 guarda el puesto
        market: marketId, // (denormalizado para filtros)
        marketName: stall.blockName || '', // o tu fuente real del nombre
        section,
        nombres: dto.nombres,
        cedula: dto.cedula,
        dactilar: dto.dactilar,
        correo: dto.correo,
        telefono: dto.telefono,
        fechaInicio,
        fechaFin,
        estado: 'EN_SOLICITUD',
      });
    } catch (e) {
      console.error(e);
    }
  }

  // === Postular (reservar el mismo stall de la solicitud) ===
 async postular(solicitudId: string, ip: string) {
  // 0) Cargar solicitud y validaciones básicas
  const solicitud = await this.solicitudModel.findById(solicitudId);
  if (!solicitud) throw new BadRequestException('Solicitud no existe');
  if (solicitud.estado !== 'EN_SOLICITUD')
    throw new BadRequestException('Estado inválido');
  if (!solicitud.stall)
    throw new BadRequestException('Solicitud sin puesto asignado');

  const cedula = String(solicitud.cedula);

  // 🚧 1) Guards anti-duplicados por cédula (muy importantes)
  // 1.1) Ya tiene un puesto a cargo o reservado actualmente
  const yaTienePuesto = await this.stallModel.exists({
    'personaACargoActual.cedula': cedula,
    estado: { $in: ['OCUPADO', 'RESERVADO'] },
  });
  if (yaTienePuesto) {
    throw new BadRequestException(
      'Ya tienes un puesto asignado o reservado. No puedes postular nuevamente.',
    );
  }

  // 1.2) Ya tiene una orden activa en proceso
  const ordenActiva = await this.ordenModel.exists({
    'persona.cedula': cedula,
    estado: { $in: ['EN_SOLICITUD', 'ASIGNADA', 'OCUPADA'] },
  });
  if (ordenActiva) {
    throw new BadRequestException(
      'Tienes una orden activa en proceso. Finaliza o cancela antes de postular nuevamente.',
    );
  }

  // 1.3) Ya tiene otra solicitud en curso (distinta a esta)
  const otraSolicitud = await this.solicitudModel.exists({
    _id: { $ne: solicitud._id },
    cedula,
    estado: { $in: ['EN_SOLICITUD', 'POSTULADA', 'APROBADA'] },
  });
  if (otraSolicitud) {
    throw new BadRequestException(
      'Ya tienes una solicitud en curso. Espera su resolución antes de postular nuevamente.',
    );
  }

  // 2) Reserva atómica del puesto (solo si está disponible)
  const aprobarAntesDe = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const stall = await this.stallModel.findOneAndUpdate(
    { _id: solicitud.stall, estado: { $in: ['LIBRE', 'disponible'] } },
    { $set: { estado: 'RESERVADO', reservadoHasta: aprobarAntesDe } },
    { new: true },
  );
  if (!stall)
    throw new BadRequestException('Conflicto: el puesto ya no está libre');

  // 3) Generar secuencial y referencia simples
  const ultimo: any = await this.ordenModel
    .findOne({}, {}, { sort: { secuencial: -1 } })
    .lean();
  const secuencial = (ultimo?.secuencial || 0) + 1;
  const referencia = String(secuencial).padStart(4, '0');

  // 4) Crear OrdenReserva en EN_SOLICITUD
  let orden: any = await this.ordenModel.create({
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
    },
  });

  await this.solicitudModel.findByIdAndUpdate(solicitud._id, {
    $set: { estado: 'POSTULADA', ordenId: orden._id },
  });

  // 5) Llamada a pago externo (con compensación si falla)
  const payload = {
    clave: solicitud.cedula,
    estado: 'P',
    fechaExpiracion: orden.fechaFin.toISOString(),
    referencia,
    observacion: `Orden de puesto ${stall.code}`,
    valor: 0.8, // TODO: calcular valor real
    codSistema: 6,
    ipCrea: ip,
    idPayer: solicitud.cedula,
    celular: solicitud.telefono,
    direccion: 'Ambato',
    email: solicitud.correo,
    nombre: solicitud.nombres,
    tipoDoc: '2',
    det: [
      {
        descripcion: `Uso temporal de puesto ${stall.code}`,
        idPago: `PAGO${String(secuencial).padStart(3, '0')}`,
        valor: 0.8,
        rubro: 9999,
      },
    ],
    generarProforma: true,
  };

  let respuestaPago: any = null;
  try {
    const resp = await firstValueFrom(
      this.http.post(
        'https://appbackend.ambato.gob.ec:3002/mercados/ordenpago/crear',
        payload,
      ),
    );
    respuestaPago = resp.data;

    await this.ordenModel.findByIdAndUpdate(orden._id, {
      $set: { pagoExterno: resp.data },
    });
  } catch (e) {
    // 🔁 Compensación: liberar puesto, revertir solicitud y marcar orden como rechazada
    await this.stallModel.findByIdAndUpdate(stall._id, {
      $set: { estado: 'LIBRE', reservadoHasta: null },
    });
    await this.solicitudModel.findByIdAndUpdate(solicitud._id, {
      $set: { estado: 'EN_SOLICITUD' },
      $unset: { ordenId: '' },
    });
    await this.ordenModel.findByIdAndUpdate(orden._id, {
      $set: { estado: 'RECHAZADA', observacion: 'Error creando orden externa' },
    });
    this.logger.error('Error creando orden de pago externa', e);
    throw new BadRequestException(
      'No se pudo crear la orden de pago externa. Intenta nuevamente.',
    );
  }

  // 6) Retorno con pagoExterno adjunto
  orden = { ...(orden.toObject?.() ? orden.toObject() : orden), pagoExterno: respuestaPago };
  return orden;
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
  if (!orden) throw new BadRequestException('Orden no existe (ref/id inválido)');
  if (orden.estado !== 'EN_SOLICITUD') {
    throw new BadRequestException('No se puede aprobar en el estado actual');
  }
  if (!orden.stall) throw new BadRequestException('Orden sin puesto');

  // 1) Ocupar el puesto (idempotente/tolerante a 'LIBRE'|'DISPONIBLE'|'RESERVADO')
  const stall = await this.stallModel.findOneAndUpdate(
    { _id: orden.stall, estado: { $in: ['RESERVADO', 'LIBRE', 'disponible'] } },
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
          telefono: orden.persona?.telefono,
          email: orden.persona?.email,
          codigoDactilar: orden.persona?.codigoDactilar,
          fechaInicio: orden.fechaInicio, // planificada
          fechaFin: orden.fechaFin,       // planificada
          fechaFinReal: null,             // se llenará al liberar
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
@Cron(CronExpression.EVERY_MINUTE, { name: 'solicitudes-every-minute' })
@Cron(CronExpression.EVERY_MINUTE, { name: 'solicitudes-every-minute' })
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
    .select({ _id: 1, stall: 1, solicitud: 1, persona: 1, fechaInicio: 1, fechaFin: 1 })
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

}
