// src/stalls/stall.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type StallDocument = HydratedDocument<Stall>;

/** Subdocumento: Persona a cargo (histórico y actual) */
@Schema({ _id: false, timestamps: false })
export class PersonaCargo {
  @Prop({ trim: true }) nombre?: string;
  @Prop({ trim: true }) apellido?: string;

  @Prop({ trim: true }) cedula?: string;          // Ej: "2300687510"
  @Prop({ trim: true }) telefono?: string;        // Ej: "0987654321"
  @Prop({ trim: true }) email?: string;           // Ej: "correo@dominio.com"
  @Prop({ trim: true }) codigoDactilar?: string;  // Ej: "E2433I4422"

  @Prop({ type: Date, required: true }) fechaInicio!: Date;
  @Prop({ type: Date }) fechaFin?: Date | null;       // planificada
  @Prop({ type: Date }) fechaFinReal?: Date | null;   // efectiva
}
export const PersonaCargoSchema = SchemaFactory.createForClass(PersonaCargo);

@Schema({ collection: 'stalls', timestamps: true })
export class Stall {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true }) code: string;
  @Prop({ required: true, trim: true }) name: string;

  @Prop({ default: true }) isActive: boolean;

  // Estado operacional del puesto
  @Prop({ default: 'LIBRE', trim: true }) estado: string;

  // Mercado dueño del puesto
  @Prop({ type: Types.ObjectId, ref: 'Market', required: true })
  market: Types.ObjectId;

  // Vínculo a bloque del mercado
  @Prop({ type: Types.ObjectId, default: null })
  blockId?: Types.ObjectId | null;

  @Prop({ type: String, trim: true })
  blockName?: string; // redundante pero útil para mostrar

  // Sección del mercado
  @Prop({ type: String, trim: true, default: null })
  section?: string | null;

  // Etiquetas libres del puesto
  @Prop({ type: [String], default: [] })
  etiquetas?: string[];

  // 👇 NUEVO: persona actual a cargo (o null si está disponible)
  @Prop({ type: PersonaCargoSchema, default: null })
  personaACargoActual?: PersonaCargo | null;

  // 👇 NUEVO: historial de personas a cargo
  @Prop({ type: [PersonaCargoSchema], default: [] })
  personaACargoAnterior?: PersonaCargo[];
}
export const StallSchema = SchemaFactory.createForClass(Stall);
