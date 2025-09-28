// src/solicitudes/solicitudes.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { ClientIp } from 'src/common/ip/client-ip.decorator';

@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly service: SolicitudesService) {}

  @Post()
  crear(@Body() dto: any) {
    return this.service.crearSolicitud(dto);
  }

  @Post(':id/postular')
  postular(@Param('id') id: string, @ClientIp() ip: string) {
    return this.service.postular(id,ip);
  }

  @Post('orden/:id/aprobar')
  aprobar(@Param('id') id: string) {
    return this.service.aprobar(id);
  }

  @Post('orden/:id/rechazar')
  rechazar(@Param('id') id: string) {
    return this.service.rechazar(id);
  }

  // útil para pruebas manuales
  @Get('cron/run')
  runCron() {
    return this.service.revisarExpiraciones();
  }

  @Get('test')
  async testUpload() {
    const result = await this.service.subirPdfYObtenerRespuesta();
    return {
      ok: true,
      result,
    };
  }

    @Get('test-mensaje')
  async test_mensaje() {
  this.service.enviarPuesto('0999952397','1Q','2Q');
    
  }
  
}
