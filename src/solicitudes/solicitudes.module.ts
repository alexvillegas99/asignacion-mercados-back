// src/solicitudes/solicitudes.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SolicitudesController } from './solicitudes.controller';
import { SolicitudesService } from './solicitudes.service';
import { Solicitud, SolicitudSchema } from './schemas/solicitud.schema';
import {
  OrdenReserva,
  OrdenReservaSchema,
} from './schemas/orden-reserva.schema';
import { Stall, StallSchema } from 'src/stalls/entities/stall.entity';
import { SchedulerService } from 'src/common/scheduler/scheduler.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Solicitud.name, schema: SolicitudSchema },
      { name: OrdenReserva.name, schema: OrdenReservaSchema },
      { name: Stall.name, schema: StallSchema },
    ]),
    HttpModule.register({ timeout: 5000, maxRedirects: 3 }),
  ],
  controllers: [SolicitudesController],
  providers: [SolicitudesService, SchedulerService],
})
export class SolicitudesModule {} 
