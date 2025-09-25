import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { StallsService } from './stalls.service';

@Controller('stalls')
export class StallsController {
  private readonly logger = new Logger(StallsController.name);

  constructor(private readonly stallsService: StallsService) {}

  // ---- Crear puesto
  @Post()
  async create(@Body() body: any) {
    this.logger.log('Creando puesto');
    return this.stallsService.create(body); // body: { code, name, marketId, blockId|blockName, section, etiquetas? }
  }

  // ---- Listar (opcional: ?marketId=...&active=true|false)
  @Get()
  async findAll(@Query() q: any) {
    return this.stallsService.findAll(q);
  }

  // ---- Listar por mercado (alias práctico)
  @Get('market/:marketId')
  async findByMarket(
    @Param('marketId') marketId: string,
    @Query('active') active?: string,
  ) {
    const only = active === undefined ? undefined : active !== 'false';
    return this.stallsService.findByMarket(marketId, only);
  }

  // ---- Obtener uno
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const s = await this.stallsService.findOne(id);
    if (!s) throw new NotFoundException('Puesto no encontrado');
    return s;
  }

  // ---- Actualizar (code, name, blockId|blockName, section, etiquetas)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.stallsService.update(id, body);
  }

  // ---- Activar / desactivar
  @Patch(':id/active')
  async setActive(@Param('id') id: string, @Body() body: any) {
    // body: { isActive: boolean }
    return this.stallsService.setActive(id, !!body?.isActive);
  }

  // ---- Eliminar (soft-delete = isActive:false)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.stallsService.softRemove(id);
    return { message: 'Puesto desactivado.' };
  }

  // ---- Asignar persona actual
  @Patch(':id/assign')
  async assign(@Param('id') id: string, @Body() body: any) {
    // body: { nombre, apellido, cedula, telefono, email, codigoDactilar, fechaInicio, fechaFin? }
    return this.stallsService.iniciarAsignacion(id, body);
  }

  // ---- Liberar persona actual (mueve al histórico)
  @Patch(':id/release')
  async release(@Param('id') id: string, @Body() body: any) {
    // body: { fechaFinReal? }
    return this.stallsService.finalizarAsignacion(id, body?.fechaFinReal);
  }
}
