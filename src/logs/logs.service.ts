import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Log, LogDocument, LogModelName } from './schemas/log.schema';

@Injectable()
export class LogsService {
  constructor(@InjectModel(LogModelName) private logModel: Model<LogDocument>) {}

  async createLog(logData: Partial<Log>): Promise<void> {
    try {
      await this.logModel.create(logData);
    } catch (error) {
      console.error('Error al guardar el log:', error);
    }
  } 
}
