// src/common/scheduler/scheduler.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { SolicitudesService } from '../../solicitudes/solicitudes.service';
import * as os from 'os';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private readonly everyMs = 60_000; // cada 1 minuto
  private readonly owner = `${os.hostname()}#${process.pid}`;

  constructor(private readonly solicitudes: SolicitudesService) {}

  onModuleInit() {
    // arranca el loop
    this.timer = setInterval(() => this.tick(), this.everyMs);
    // primer disparo rápido
    this.tick().catch(() => void 0);
    this.logger.log(`Scheduler iniciado por ${this.owner} cada ${this.everyMs / 1000}s`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private running = false;

  private async tick() {
    if (this.running) return; // evita overlap si una corrida tarda más de 1 min
    this.running = true;
    try {
      await this.solicitudes.revisarExpiraciones(); // <-- tu lógica ya implementada
    } catch (e) {
      this.logger.error('Error en revisarExpiraciones', e as any);
    } finally {
      this.running = false;
    }
  }
}
