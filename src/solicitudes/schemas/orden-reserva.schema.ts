// src/solicitudes/schemas/orden-reserva.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrdenReservaDocument = HydratedDocument<OrdenReserva>;

@Schema({ timestamps: true , strict:false })
export class OrdenReserva {
  @Prop({ type: Types.ObjectId, ref: 'Market', index: true })
  market!: Types.ObjectId;
  @Prop({ trim: true, index: true }) section!: string;
  @Prop({ type: Types.ObjectId, ref: 'Stall', index: true })
  stall!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Solicitud', index: true })
  solicitud!: Types.ObjectId;
  @Prop({ type: Number }) secuencial!: number;

   @Prop({ required: true, unique: true, index: true })
  referencia: string; // '0001'
  @Prop({ type: Date }) fechaInicio!: Date;
  @Prop({ type: Date }) fechaFin!: Date;

  @Prop({
    enum: ['EN_SOLICITUD', 'OCUPADA', 'LIBERADA', 'RECHAZADA', 'VENCIDA'],
    default: 'EN_SOLICITUD',
    index: true,
  })
  estado!: 'EN_SOLICITUD' | 'OCUPADA' | 'LIBERADA' | 'RECHAZADA' | 'VENCIDA';

  // Deadlines para jobs
  @Prop({ type: Date, index: true }) aprobarAntesDe!: Date; // createdAt + 24h
  @Prop({ type: Date, index: true }) liberarEn!: Date; // fechaFin (al aprobar)

  @Prop({
    type: {
      nombre: String,
      apellido: String,
      cedula: String,
      telefono: String,
      email: String,
      codigoDactilar: String,
      provincia:String,
      ciudad:String
    },
    _id: false,
  })
  persona?: any;

  @Prop({ type: Object, default: null })
  pagoExterno?: object;
}
export const OrdenReservaSchema = SchemaFactory.createForClass(OrdenReserva);

