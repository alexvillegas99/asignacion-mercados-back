import { Global, Module } from '@nestjs/common';
import { LogsService } from './logs.service';
import { MongooseModule } from '@nestjs/mongoose';
import { LogModelName, LogSchema } from './schemas/log.schema';
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: LogModelName, schema: LogSchema }])],
  providers: [LogsService],
  exports: [LogsService],
})
export class LogsModule {}
