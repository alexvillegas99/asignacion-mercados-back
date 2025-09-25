import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Stall, StallDocument } from './entities/stall.entity';
import { Market, MarketDocument } from 'src/markets/entities/market.entity';

@Injectable()
export class StallsService {
  constructor(
    @InjectModel(Stall.name) private readonly stallModel: Model<StallDocument>,
    @InjectModel(Market.name)
    private readonly marketModel: Model<MarketDocument>,
  ) {}

  // ===== Helpers =====
  private asOid(s?: any) {
    return s && Types.ObjectId.isValid(String(s))
      ? new Types.ObjectId(String(s))
      : null;
  }
  private norm(x: string) {
    return (x || '').trim().toLowerCase();
  }
  private assertId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID inválido');
    }
  }

  /** Valida que blockId|blockName y section pertenezcan al market. Devuelve { marketId, blockId, blockName, section } */


  // ===== CRUD =====

  async create(body: any): Promise<any> {
    console.log(body)
    const { code, name, marketId } = body || {};
    if (!code || !name || !marketId) {
      throw new BadRequestException('code, name y marketId son requeridos');
    }

    const link = await this.resolveBlockAndSection(marketId, {
      blockId: body?.blockId,
      blockName: body?.blockName,
      section: body?.section,
    });

    const s = await this.stallModel.create({
      code: String(code).trim(),
      name: String(name).trim(),
      market: link.marketId,
      blockId: link.blockId,
      blockName: link.blockName,
      section: link.section ?? null,
      etiquetas: Array.isArray(body?.etiquetas) ? body.etiquetas : [],
      isActive: true,
      estado: 'disponible',
    });
    return s.toJSON();
  }

  async findAll(q: any): Promise<any[]> {
    const flt: any = {};
    if (q?.marketId) {
      const mid = this.asOid(q.marketId);
      if (mid) flt.market = mid;
    }
    if (q?.active !== undefined) {
      const v =
        typeof q.active === 'string' ? q.active !== 'false' : !!q.active;
      flt.isActive = v;
    }

    const list = await this.stallModel.find(flt).sort({ code: 1 }).lean();
    return list;
  }

  async findByMarket(marketId: string, active?: boolean): Promise<any[]> {
    const mid = this.asOid(marketId);
    if (!mid) throw new NotFoundException('marketId inválido');
    const flt: any = { market: mid };
    if (active !== undefined) flt.isActive = !!active;
    return this.stallModel.find(flt).sort({ code: 1 }).lean();
  }

  async findOne(id: string): Promise<any> {
    this.assertId(id);
    const s = await this.stallModel.findById(id).lean();
    if (!s) throw new NotFoundException('Puesto no encontrado');
    return s;
  }

  async update(id: string, body: any): Promise<any> {
    this.assertId(id);
    const s = await this.stallModel.findById(id);
    if (!s) throw new NotFoundException('Puesto no encontrado');

    const marketId = String(body?.marketId || s.market);
    const link = await this.resolveBlockAndSection(marketId, {
      blockId: body?.blockId,
      blockName: body?.blockName,
      section: body?.section,
    });

    if (body?.code != null) s.code = String(body.code).trim();
    if (body?.name != null) s.name = String(body.name).trim();
    if (body?.etiquetas != null)
      s.etiquetas = Array.isArray(body.etiquetas) ? body.etiquetas : [];

    s.market = link.marketId;
    s.blockId = link.blockId ?? null;
    s.blockName = link.blockName ?? undefined;
    if (link.section !== null) s.section = link.section;

    const saved = await s.save();
    return saved.toJSON();
  }

  async setActive(id: string, isActive: boolean): Promise<any> {
    this.assertId(id);
    const s = await this.stallModel
      .findByIdAndUpdate(id, { $set: { isActive: !!isActive } }, { new: true })
      .lean();
    if (!s) throw new NotFoundException('Puesto no encontrado');
    return s;
  }

  /** Soft delete = isActive:false */
  async softRemove(id: string): Promise<void> {
    this.assertId(id);
    const s = await this.stallModel.findById(id);
    if (!s) throw new NotFoundException('Puesto no encontrado');
    s.isActive = false;
    await s.save();
  }

  // ===== Asignaciones =====

  /** Inicia asignación (set personaACargoActual). Lanza error si ya hay una en curso. */
  async iniciarAsignacion(id: string, persona: any): Promise<any> {
    this.assertId(id);
    const s = await this.stallModel.findById(id);
    if (!s) throw new NotFoundException('Puesto no encontrado');
    if (s.personaACargoActual)
      throw new BadRequestException('Ya existe una persona a cargo');

    const inicio = persona?.fechaInicio
      ? new Date(persona.fechaInicio)
      : new Date();
    const finPlan = persona?.fechaFin ? new Date(persona.fechaFin) : null;

    s.personaACargoActual = {
      nombre: persona?.nombre,
      apellido: persona?.apellido,
      cedula: persona?.cedula,
      telefono: persona?.telefono,
      email: persona?.email,
      codigoDactilar: persona?.codigoDactilar,
      fechaInicio: inicio,
      fechaFin: finPlan,
      fechaFinReal: null,
    } as any;

    s.estado = 'asignado';
    const saved = await s.save();
    return saved.toJSON();
  }

  /** Finaliza asignación (mueve actual -> historial y limpia actual). */
  async finalizarAsignacion(id: string, fechaFinReal?: any): Promise<any> {
    this.assertId(id);
    const s = await this.stallModel.findById(id);
    if (!s) throw new NotFoundException('Puesto no encontrado');
    const actual: any = s.personaACargoActual;
    if (!actual) throw new BadRequestException('No hay persona a cargo');

    const finReal = fechaFinReal ? new Date(fechaFinReal) : new Date();
    s.personaACargoAnterior = [
      ...(s.personaACargoAnterior || []),
      { ...actual, fechaFinReal: finReal },
    ] as any;

    s.personaACargoActual = null;
    s.estado = 'disponible'; // o 'asignacion' si manejas 24h de sorteo aquí
    const saved = await s.save();
    return saved.toJSON();
  }

  private async resolveBlockAndSection(marketId: string, body: any) {
  const mid = this.asOid(marketId);
  if (!mid) throw new NotFoundException('marketId inválido');

  const market = await this.marketModel.findById(mid).lean();
  if (!market) throw new NotFoundException('Market no encontrado');

  // SECTION
  let section: string | null = null;
  if (body?.section != null) {
    const s:any = String(body.section || '').trim();
    if (s) {
      if (!Array.isArray(market.sections) || !market.sections.includes(s)) {
        throw new BadRequestException('Sección no válida para este mercado');
      }
      section = s;
    }
  }

  // BLOCK por id o nombre (acepta blockId como id o como nombre; o blockName)
  let blockId: Types.ObjectId | null = null;
  let blockName: string | undefined = undefined;

  const idOrName = body?.blockId ?? body?.blockName; // prioridad blockId, luego blockName
  if (idOrName != null) {
    const raw = String(idOrName).trim();
    const guessId = this.asOid(raw);

    if (guessId) {
      // Buscar por _id
      const found = (market.blocks || []).find((b: any) => String(b._id || '') === String(guessId));
      if (!found) throw new BadRequestException('El bloque no pertenece al mercado');
      blockId = guessId;
      blockName = found.name;
    } else {
      // Tratar como nombre
      const found = (market.blocks || []).find((b: any) => this.norm(b?.name) === this.norm(raw));
      if (!found) throw new BadRequestException('El bloque no pertenece al mercado');
      blockId = found._id ? new Types.ObjectId(String(found._id)) : null;
      blockName = found.name;
    }
  }

  return { marketId: mid, blockId, blockName, section };
}

}
