// src/clients/client.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

export type ClientDocument = HydratedDocument<Client>;

@Schema({
  collection: 'clients',
  timestamps: true, // createdAt, updatedAt
})
export class Client {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    maxlength: 20,
    index: true,
  })
  identityCard: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ required: true, default: true })
  hasAcceptedTerms: boolean;

}

export const ClientSchema = SchemaFactory.createForClass(Client);

// --- Hooks: normalización + hash ---
ClientSchema.pre('save', async function (next) {
  const doc = this as ClientDocument;

  if (doc.isModified('email') && doc.email)
    doc.email = doc.email.toLowerCase().trim();
  if (doc.isModified('phone') && doc.phone) doc.phone = doc.phone.trim();
  if (doc.isModified('identityCard') && doc.identityCard)
    doc.identityCard = doc.identityCard.trim();

  if (doc.isModified('password') && doc.password) {
    doc.password = await bcrypt.hash(doc.password, 10);
  }
  next();
});

ClientSchema.pre('findOneAndUpdate', async function (next) {
  const update: any = this.getUpdate() || {};
  if (update.email) update.email = String(update.email).toLowerCase().trim();
  if (update.phone) update.phone = String(update.phone).trim();
  if (update.identityCard)
    update.identityCard = String(update.identityCard).trim();
  if (update.password) update.password = await bcrypt.hash(update.password, 10);
  this.setUpdate(update);
  next();
});

// --- Virtual populate: purchases ---
// Requiere que Purchase tenga un campo client: { type: ObjectId, ref: 'Client' }
ClientSchema.virtual('purchases', {
  ref: 'Purchase',
  localField: '_id',
  foreignField: 'client',
});
