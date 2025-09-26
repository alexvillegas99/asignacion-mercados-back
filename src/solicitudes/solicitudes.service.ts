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
    const solicitud = await this.solicitudModel.findById(solicitudId);
    if (!solicitud) throw new BadRequestException('Solicitud no existe');
    if (solicitud.estado !== 'EN_SOLICITUD')
      throw new BadRequestException('Estado inválido');
    if (!solicitud.stall)
      throw new BadRequestException('Solicitud sin puesto asignado');

    const aprobarAntesDe = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // reserva atómica
    const stall = await this.stallModel.findOneAndUpdate(
      { _id: solicitud.stall, estado: { $in: ['LIBRE', 'disponible'] } },
      { $set: { estado: 'RESERVADO', reservadoHasta: aprobarAntesDe } },
      { new: true },
    );
    if (!stall)
      throw new BadRequestException('Conflicto: el puesto ya no está libre');

    // === 1) Generar secuencial simple ===
    const ultimo: any = await this.ordenModel
      .findOne({}, {}, { sort: { secuencial: -1 } })
      .lean();
    const secuencial = (ultimo?.secuencial || 0) + 1;
    const referencia = String(secuencial).padStart(4, '0');
    // === 2) Crear OrdenReserva ===
    const orden: any = await this.ordenModel.create({
      secuencial, // 👈 nuevo campo
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

    // === 3) Enviar payload al servicio externo ===
    const payload = {
      clave: solicitud.cedula,
      estado: 'P',
      fechaExpiracion: orden.fechaFin.toISOString(),
      referencia, // ej: "0008"
      observacion: `Orden de puesto ${stall.code}`,
      valor: 0.8, // 👈 aquí debes calcular el valor real
      codSistema: 6,
      ipCrea: ip, // opcional: lee de req.ip
      idPayer: solicitud.cedula,
      celular: solicitud.telefono,
      direccion: 'Ambato', // 👈 si lo pides en el formulario puedes reemplazar
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
    console.debug(payload);
    console.log('payload crear orden de pago');
    let repuestaOrdenGadma: any = null;
    try {
      const resp = await firstValueFrom(
        this.http.post(
          'https://appbackend.ambato.gob.ec:3002/mercados/ordenpago/crear',
          payload,
        ),
      );
      this.logger.log(
        `Orden de pago creada en sistema externo: ${JSON.stringify(resp.data)}`,
      );
      repuestaOrdenGadma = resp.data;
      // opcional: guardar respuesta externa en la orden
      await this.ordenModel.findByIdAndUpdate(orden._id, {
        $set: { pagoExterno: resp.data },
      });
    } catch (e) {
      this.logger.error('Error creando orden de pago externa', e);
    }
    orden.pagoExterno = repuestaOrdenGadma;
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
  @Cron(CronExpression.EVERY_10_MINUTES)
  async revisarExpiraciones() {
    const ahora = new Date();
    this.logger.debug(
      `Ejecutando revisión de expiraciones @ ${ahora.toISOString()}`,
    );

    // 1) Ordenes EN_SOLICITUD vencidas (24h)
    const vencidas = await this.ordenModel
      .find({
        estado: 'EN_SOLICITUD',
        aprobarAntesDe: { $lte: ahora },
      })
      .limit(500);

    for (const o of vencidas) {
      const updated = await this.ordenModel.findOneAndUpdate(
        { _id: o._id, estado: 'EN_SOLICITUD' },
        { $set: { estado: 'VENCIDA' } },
        { new: true },
      );
      if (!updated) continue;

      await this.stallModel.findOneAndUpdate(
        { _id: o.stall, estado: 'RESERVADO' },
        { $set: { estado: 'LIBRE', reservadoHasta: null } },
      );

      await this.solicitudModel.findByIdAndUpdate(o.solicitud, {
        $set: { estado: 'EN_SOLICITUD' },
      });
    }

    // 2) Órdenes OCUPADAS cuyo periodo terminó
    const paraLiberar = await this.ordenModel
      .find({
        estado: 'OCUPADA',
        $or: [{ liberarEn: { $lte: ahora } }, { fechaFin: { $lte: ahora } }],
      })
      .limit(500);

    for (const o of paraLiberar) {
      const updated = await this.ordenModel.findOneAndUpdate(
        { _id: o._id, estado: 'OCUPADA' },
        { $set: { estado: 'LIBERADA' } },
        { new: true },
      );
      if (!updated) continue;

      await this.stallModel.findByIdAndUpdate(o.stall, {
        $set: { estado: 'LIBRE', reservadoHasta: null },
        $push: {
          personasCargo: {
            nombre: o.persona?.nombre,
            apellido: o.persona?.apellido,
            cedula: o.persona?.cedula,
            telefono: o.persona?.telefono,
            email: o.persona?.email,
            codigoDactilar: o.persona?.codigoDactilar,
            fechaInicio: o.fechaInicio,
            fechaFin: o.fechaFin,
            fechaFinReal: new Date(),
          },
        },
      });
    }

    // 3) Limpieza de Stalls RESERVADO con fecha vencida
    await this.stallModel.updateMany(
      { estado: 'RESERVADO', reservadoHasta: { $lte: ahora } },
      { $set: { estado: 'LIBRE', reservadoHasta: null } },
    );
  }
}
