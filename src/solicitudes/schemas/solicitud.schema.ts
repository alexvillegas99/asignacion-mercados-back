// src/solicitudes/schemas/solicitud.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SolicitudDocument = HydratedDocument<Solicitud>;

@Schema({ timestamps: true,strict:false })
export class Solicitud {
  @Prop({ type: Types.ObjectId, ref: 'Stall', index: true })
  stall!: Types.ObjectId; // 👈 referencia al puesto elegido

  @Prop({ type: Types.ObjectId, ref: 'Market', index: true })
  market!: Types.ObjectId;

  @Prop({ trim: true }) marketName!: string;
  @Prop({ type: String, trim: true })
  section?: string;

  @Prop({ trim: true }) nombres!: string;
  @Prop({ trim: true }) cedula!: string;
  @Prop({ trim: true }) dactilar!: string;
  @Prop({ trim: true }) correo!: string;
  @Prop({ trim: true }) telefono!: string;
    @Prop({ trim: true }) provincia!: string;
  @Prop({ trim: true }) ciudad!: string;
 6
  @Prop({ type: Date }) fechaInicio!: Date;
  @Prop({ type: Date }) fechaFin!: Date;

  @Prop({
    enum: ['EN_SOLICITUD', 'POSTULADA', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'LIBERADA'],
    default: 'EN_SOLICITUD',
    index: true,
  })
  estado!:
    | 'EN_SOLICITUD'
    | 'POSTULADA'
    | 'APROBADA'
    | 'RECHAZADA'
    | 'CANCELADA' 
    | 'LIBERADA';

  @Prop({ type: Types.ObjectId, ref: 'OrdenReserva' })
  ordenId?: Types.ObjectId | null;
}
export const SolicitudSchema = SchemaFactory.createForClass(Solicitud);
