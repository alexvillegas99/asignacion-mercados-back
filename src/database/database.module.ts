
import { MongooseModule } from '@nestjs/mongoose';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { MONGO_URL } from 'src/config/config.env';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(MONGO_URL),
      }),
      inject: [ConfigService],
    }), 
  ], 
})
export class DatabaseModule {}
