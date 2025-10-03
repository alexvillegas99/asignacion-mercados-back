import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { DateTime } from 'luxon';
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

    @Get('now')
  getNow() {
    console.log('consultando hora')
    const serverUtc = DateTime.utc(); // reloj del servidor en UTC
    const gye = serverUtc.setZone('America/Guayaquil');

    return {
      // fuentes principales
      isoUtc: serverUtc.toISO(),                     // p.ej. "2025-10-03T17:25:40.123Z"
      isoGuayaquil: gye.toISO(),                     // p.ej. "2025-10-03T12:25:40.123-05:00"

      // metadatos útiles para el front
      epochMs: serverUtc.toMillis(),
      timezone: 'America/Guayaquil',
      serverOffsetMinutes: gye.offset,               // -300 = UTC-5
      weekday: gye.weekday,                          // 1=Lun ... 7=Dom
      hour: gye.hour,
      minute: gye.minute,
      second: gye.second,

      // por si quieres mostrar también fecha local formateada
      formattedLocal: gye.toFormat("yyyy-LL-dd HH:mm:ss 'GMT'ZZ"),
      // salud del servidor (opcional)
      source: 'server-clock',
    };
  }
}
