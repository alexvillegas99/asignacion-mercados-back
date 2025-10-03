import {
  Controller, Get, Post, Body, Patch, Param, Delete, Res, Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { MarketsService } from './markets.service';

@Controller('markets')
export class MarketsController {
  private readonly logger = new Logger(MarketsController.name);
  constructor(private readonly marketsService: MarketsService) {}

  @Post()
  async create(@Res() res: Response, @Body() body: any) {
    this.logger.log('Creating a new market');
    const market = await this.marketsService.create(body);
    this.logger.log(`Market created with ID: ${market._id}`);
    return res.status(201).json(market);
  }

  @Get()
  async findAll(@Res() res: Response) {
    this.logger.log('Fetching all markets');
    const markets = await this.marketsService.findAll();
    this.logger.log(`Found ${markets.length} markets`);
    return res.status(200).json(markets);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    this.logger.log(`Fetching market with ID: ${id}`);
    const market = await this.marketsService.findOne(id);
    return res.status(200).json(market);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    this.logger.log(`Updating market with ID: ${id}`);
    const market = await this.marketsService.update(id, body);
    return res.status(200).json(market);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    this.logger.log(`Removing market with ID: ${id}`);
    await this.marketsService.remove(id);
    return res.status(200).json({ message: 'Se ha eliminado el mercado correctamente.' });
  }

  // ============ SECCIONES (strings) ============
  @Patch(':id/sections')
  async setSections(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    // body.sections: string[]
    const market = await this.marketsService.setSections(id, Array.isArray(body?.sections) ? body.sections : []);
    return res.status(200).json(market);
  }

  // ============ BLOQUES DINÁMICOS ============
  @Post(':id/blocks')
  async addBlock(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    // body.name: string
    const market = await this.marketsService.addBlockByName(id, String(body?.name || ''));
    return res.status(201).json(market);
  }
@Patch(':id/blocks/:blockId') // renombrar (y opcionalmente otros campos simples)
  async renameBlock(@Param('id') id: string, @Param('blockId') blockId: string, @Body() body: any, @Res() res: Response) {
    const market = await this.marketsService.renameBlock(id, blockId, String(body?.name || ''));
    return res.status(200).json(market);
  }

  @Delete(':id/blocks/:blockId')
  async removeBlock(@Param('id') id: string, @Param('blockId') blockId: string, @Res() res: Response) {
    const market = await this.marketsService.removeBlock(id, blockId);
    return res.status(200).json(market);
  }

  @Patch(':id/blocks/:blockId/active')
  async setBlockActive(@Param('id') id: string, @Param('blockId') blockId: string, @Body() body: any, @Res() res: Response) {
    const market = await this.marketsService.setBlockActive(id, blockId, !!body?.isActive);
    return res.status(200).json(market);
  }

  @Patch(':id/blocks/:blockId/access')
  async setBlockAccess(@Param('id') id: string, @Param('blockId') blockId: string, @Body() body: any, @Res() res: Response) {
    const market = await this.marketsService.setBlockAccess(id, blockId, !!body?.exclusive, Array.isArray(body?.prefixes) ? body.prefixes : []);
    return res.status(200).json(market);
  }

  // Reparar _id faltantes en blocks
  @Post(':id/blocks/repair-ids')
  async repairBlockIds(@Param('id') id: string, @Res() res: Response) {
    const market = await this.marketsService.repairBlockIds(id);
    return res.status(200).json(market);
  }


  @Patch(':id/blocks/:blockId/wholesale')
async setBlockWholesale(
  @Param('id') id: string,
  @Param('blockId') blockId: string,
  @Body() body: any,
  @Res() res: Response,
) {
  const market = await this.marketsService.setBlockWholesale(id, blockId, !!body?.mayorista);
  return res.status(200).json(market);
}

  
}
