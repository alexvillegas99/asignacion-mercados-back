import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { Client, ClientSchema } from './entities/client.entity';
import { MongooseModule } from '@nestjs/mongoose';
import { JWT_EXPIRES_IN, JWT_SECRET } from 'src/config/config.env';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Client.name, schema: ClientSchema }]),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: {
        expiresIn: '365d',
      },
    }),
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
