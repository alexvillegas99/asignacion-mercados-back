// src/markets/market.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MarketSection } from '../enum/market-section.enum';

export type MarketDocument = HydratedDocument<Market>;

/** Subdocumento simple: solo nombre (+ activo opcional) */
@Schema({ _id: true, timestamps: false })
export class Block {
  @Prop() _id?: Types.ObjectId;           // Dejar opcional para que Mongoose lo genere
  @Prop({ required: true, trim: true }) name: string;

  @Prop({ default: true })  isActive?: boolean;

  @Prop({ default: true }) exclusive?: boolean;
  @Prop({ type: [String], default: ['180'] }) prefixes?: string[]; // ej. ["18", "180"]
}
export const BlockSchema = SchemaFactory.createForClass(Block);

@Schema({ collection: 'markets', timestamps: true })
export class Market {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ trim: true })
  imageUrl?: string;

  @Prop({ default: true })
  isActive: boolean;

    @Prop({
    type: [String],
    enum: Object.values(MarketSection),
    default: [],
  })
  sections?: MarketSection[];


  /** Bloques dinámicos por mercado (solo nombres) */
  @Prop({ type: [BlockSchema], default: [] })
  blocks?: Block[];

  // virtual populate si lo usas
  stalls?: any[];
}
export const MarketSchema = SchemaFactory.createForClass(Market);

MarketSchema.virtual('stalls', {
  ref: 'Stall',
  localField: '_id',
  foreignField: 'market',
});
