// users/user.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Role } from '../../common/enums';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  _id: string;

  @Prop({ required: true, trim: true })
  nombre: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ trim: true })
  telefono?: string;

  @Prop({ type: [String], default: [Role.USER] })
  roles: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Hooks para normalizar y hashear
UserSchema.pre('save', async function (next) {
  const doc = this as UserDocument;
  if (doc.isModified('email') && doc.email) doc.email = doc.email.toLowerCase().trim();
  if (doc.isModified('password') && doc.password) doc.password = await bcrypt.hash(doc.password, 10);
  next();
});

UserSchema.pre('findOneAndUpdate', async function (next) {
  const update: any = this.getUpdate();
  if (update?.email) update.email = String(update.email).toLowerCase().trim();
  if (update?.password) update.password = await bcrypt.hash(update.password, 10);
  this.setUpdate(update);
  next();
});
