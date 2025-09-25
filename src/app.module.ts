import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LogsModule } from './logs/logs.module';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/config.env';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { MarketsModule } from './markets/markets.module';
import { StallsModule } from './stalls/stalls.module';
@Module({
  imports: [ 
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    LogsModule,
    UsersModule,
    AuthModule,
    ClientsModule,
    MarketsModule,
    StallsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
