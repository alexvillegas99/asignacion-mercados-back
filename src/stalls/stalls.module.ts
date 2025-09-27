import { Module } from '@nestjs/common';
import { StallsService } from './stalls.service';
import { StallsController } from './stalls.controller';
import { Stall, StallSchema } from './entities/stall.entity';
import { MarketsModule } from '../markets/markets.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Market, MarketSchema } from 'src/markets/entities/market.entity';
import { OrdenReserva, OrdenReservaSchema } from 'src/solicitudes/schemas/orden-reserva.schema';
import { Solicitud, SolicitudSchema } from 'src/solicitudes/schemas/solicitud.schema';

@Module({
  imports: [
       MongooseModule.forFeature([
            { name: Stall.name, schema: StallSchema },
             { name: Market.name, schema: MarketSchema },
               { name: OrdenReserva.name, schema: OrdenReservaSchema },
               { name: Solicitud.name, schema: SolicitudSchema },
          ]),
          MarketsModule
  ], 
  controllers: [StallsController],
  providers: [StallsService],
  exports: [StallsService],
})
export class StallsModule {}
