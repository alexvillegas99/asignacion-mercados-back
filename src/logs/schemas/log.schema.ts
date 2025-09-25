import { HydratedDocument } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type LogDocument = HydratedDocument<Log>;

@Schema({ timestamps: true })
export class Log {
  @Prop({ required: true })
  statusCode: number;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  method: string;

  @Prop({ required: true })
  path: string;

  @Prop({ type: Object, default: {} })
  requestBody: Record<string, any>; // 📌 Guarda el body enviado en la petición

  @Prop({ type: Object, default: {} })
  requestHeaders: Record<string, any>; // 📌 Guarda los headers

  @Prop()
  stackTrace?: string;

  @Prop({ default: new Date() })
  timestamp: Date;
}

export const LogSchema = SchemaFactory.createForClass(Log);
export const LogModelName = 'logs';
