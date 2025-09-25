import { Module } from '@nestjs/common';
import { MarketsService } from './markets.service';
import { MarketsController } from './markets.controller';
import { Market, MarketSchema } from './entities/market.entity';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
     MongooseModule.forFeature([
      { name: Market.name, schema: MarketSchema },
    
    ]),
  ],
  controllers: [MarketsController],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MarketsModule {}
