import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Market, MarketDocument } from './entities/market.entity';

@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);

  constructor(
    @InjectModel(Market.name)
    private readonly marketModel: Model<MarketDocument>,
  ) {}

  // Normalizador para evitar duplicados por nombre (case-insensitive)
  private norm(x: string) { return (x || '').trim().toLocaleLowerCase(); }
  private assertId(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('ID inválido');
  }

  async create(body: any): Promise<any> {
    const market = new this.marketModel(body || {});
    const saved = await market.save();
    return saved.toJSON();
  }

  async findAll(): Promise<any[]> {
    return this.marketModel.find({ isActive: true }).sort({ name: 1 }).lean();
  }

  async findOne(id: string): Promise<any> {
    this.assertId(id);
    const market = await this.marketModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .populate('stalls')
      .lean();
    if (!market) throw new NotFoundException('No se ha encontrado el mercado.');
    return market;
  }

  async findMany(ids: string[]): Promise<any[]> {
    const objectIds = (ids || [])
      .filter(Types.ObjectId.isValid)
      .map((x) => new Types.ObjectId(x));
    if (objectIds.length === 0) return [];
    return this.marketModel
      .find({ _id: { $in: objectIds }, isActive: true })
      .sort({ name: 1 })
      .lean();
  }

  async update(id: string, body: any): Promise<any> {
    this.assertId(id);
    const updated = await this.marketModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), isActive: true },
        { ...(body || {}) },
        { new: true, runValidators: true },
      )
      .lean();
    if (!updated) throw new NotFoundException(`No se ha encontrado el mercado con id ${id}.`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    this.assertId(id);
    const market = await this.marketModel.findOne({ _id: new Types.ObjectId(id), isActive: true });
    if (!market) throw new NotFoundException(`No se ha encontrado el mercado con id ${id}.`);
    market.isActive = false;
    await market.save();
    this.logger.log(`Market ${id} removed (soft-delete).`);
  }

  /* =========================
     SECCIONES (string[])
     ========================= */
  async setSections(id: string, sections: any[]): Promise<any> {
    console.log('editando secciones',id,sections);
    this.assertId(id);
    const clean = (Array.isArray(sections) ? sections : [])
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0);

    // quitar duplicados (case-insensitive) conservando la 1ra capitalización
    const uniqMap = new Map<string, string>();
    for (const s of clean) {
      const k = this.norm(s);
      if (!uniqMap.has(k)) uniqMap.set(k, s);
    }
    const uniq = Array.from(uniqMap.values());

    const updated = await this.marketModel.findByIdAndUpdate(
      id,
      { $set: { sections: uniq } },
      { new: true },
    ).lean();

    if (!updated) throw new NotFoundException('Market no encontrado');
    return updated;
  }

  /* =========================
     BLOQUES (subdocs dinámicos)
     ========================= */

  async addBlockByName(id: string, name: string): Promise<any> {
    this.assertId(id);
    const n = String(name || '').trim();
    if (!n) throw new BadRequestException('name requerido');

    const market = await this.marketModel.findById(id);
    if (!market) throw new NotFoundException('Market no encontrado');

    const exists = (market.blocks ?? []).some((b: any) => this.norm(b?.name) === this.norm(n));
    if (exists) throw new BadRequestException('El bloque ya existe en este mercado');

    market.blocks = [...(market.blocks ?? []), { name: n, isActive: true }];
    await market.save();
    return market.toJSON();
  }


  /** Reemplaza TODOS los bloques por una lista de nombres */
  async setBlocksFromNames(id: string, names: any[]): Promise<any> {
    this.assertId(id);
    const clean = (Array.isArray(names) ? names : [])
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0);

    // quitar duplicados (case-insensitive) conservando la 1ra capitalización
    const uniqMap = new Map<string, string>();
    for (const s of clean) {
      const k = this.norm(s);
      if (!uniqMap.has(k)) uniqMap.set(k, s);
    }
    const blocks = Array.from(uniqMap.values()).map((n) => ({ name: n, isActive: true }));

    const updated = await this.marketModel.findByIdAndUpdate(
      id,
      { $set: { blocks } },
      { new: true },
    ).lean();

    if (!updated) throw new NotFoundException('Market no encontrado');
    return updated;
  }

   
  private assertMarket(id: string) { if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Market ID inválido'); }

  // ---------- Helpers ----------
private ensureBlocksIds(m: MarketDocument) {
  const blocks = m.blocks ?? [];
  let changed = false;
  m.blocks = blocks.map((b: any) => {
    if (!b._id) { b._id = new Types.ObjectId(); changed = true; }
    if (!Array.isArray(b.prefixes)) b.prefixes = [];
    if (typeof b.exclusive !== 'boolean') b.exclusive = false;
    if (typeof b.isActive !== 'boolean') b.isActive = true;
    if (typeof b.mayorista !== 'boolean') b.mayorista = false; // <- nuevo default
    return b;
  }) as any;
  return changed;
}

  // ---------- Acciones sobre bloques ----------
  async renameBlock(marketId: string, blockId: string, newName: string): Promise<any> {
    this.assertMarket(marketId);
    const name = (newName || '').trim();
    if (!name) throw new BadRequestException('name requerido');

    const m = await this.marketModel.findById(marketId);
    if (!m) throw new NotFoundException('Market no encontrado');

    // Asegura _id en todos los bloques
    const changed = this.ensureBlocksIds(m);

    // Busca por id de subdocumento (Mongoose DocumentArray)
    let b = Types.ObjectId.isValid(blockId) ? (m.blocks as any).id(blockId) : null;
    if (!b) {
      // Fallback: intentar por string de _id aunque no sea ObjectId (por si quedaron sin cast)
      b = (m.blocks ?? []).find((x: any) => String(x._id) === String(blockId));
    }
    if (!b) throw new NotFoundException('Bloque no encontrado');

    // Evita duplicados por nombre (case-insensitive)
    const dup = (m.blocks ?? []).some((x: any) =>
      this.norm(x.name) === this.norm(name) && String(x._id) !== String(b._id),
    );
    if (dup) throw new BadRequestException('Ya existe otro bloque con ese nombre');

    b.name = name;

    await m.save();
    const out = changed ? await this.marketModel.findById(marketId).lean() : m.toObject();
    return out;
  }

  async removeBlock(marketId: string, blockId: string): Promise<any> {
    this.assertMarket(marketId);
    const m = await this.marketModel.findById(marketId);
    if (!m) throw new NotFoundException('Market no encontrado');

    const changed = this.ensureBlocksIds(m);

    // Intenta con el helper .id(), si no, filtra manualmente
    const doc = Types.ObjectId.isValid(blockId) ? (m.blocks as any).id(blockId) : null;
    if (doc) {
      doc.deleteOne(); // marca para eliminar
    } else {
      const before = (m.blocks ?? []).length;
      m.blocks = (m.blocks ?? []).filter((x: any) => String(x._id) !== String(blockId));
      if (m.blocks.length === before) throw new NotFoundException('Bloque no encontrado');
    }

    await m.save();
    const out = changed ? await this.marketModel.findById(marketId).lean() : m.toObject();
    return out;
  }

  async setBlockActive(marketId: string, blockId: string, active: boolean): Promise<any> {
    this.assertMarket(marketId);
    const m = await this.marketModel.findById(marketId);
    if (!m) throw new NotFoundException('Market no encontrado');

    const changed = this.ensureBlocksIds(m);

    let b = Types.ObjectId.isValid(blockId) ? (m.blocks as any).id(blockId) : null;
    if (!b) b = (m.blocks ?? []).find((x: any) => String(x._id) === String(blockId));
    if (!b) throw new NotFoundException('Bloque no encontrado');

    b.isActive = !!active;
    await m.save();
    const out = changed ? await this.marketModel.findById(marketId).lean() : m.toObject();
    return out;
  }

  async setBlockAccess(marketId: string, blockId: string, exclusive: boolean, prefixes: any[]): Promise<any> {
    this.assertMarket(marketId);
    const m = await this.marketModel.findById(marketId);
    if (!m) throw new NotFoundException('Market no encontrado');

    const changed = this.ensureBlocksIds(m);

    let b = Types.ObjectId.isValid(blockId) ? (m.blocks as any).id(blockId) : null;
    if (!b) b = (m.blocks ?? []).find((x: any) => String(x._id) === String(blockId));
    if (!b) throw new NotFoundException('Bloque no encontrado');

    const clean = (Array.isArray(prefixes) ? prefixes : [])
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0);
    // únicos (case-sensitive está bien para prefijos)
    const uniq = Array.from(new Set(clean));

    b.exclusive = !!exclusive;
    b.prefixes = uniq;

    await m.save();
    const out = changed ? await this.marketModel.findById(marketId).lean() : m.toObject();
    return out;
  }

  // ---------- Reparación (_id faltantes) ----------
  async repairBlockIds(marketId: string): Promise<any> {
    this.assertMarket(marketId);
    const m = await this.marketModel.findById(marketId);
    if (!m) throw new NotFoundException('Market no encontrado');

    const changed = this.ensureBlocksIds(m);
    if (changed) await m.save();
    return (await this.marketModel.findById(marketId).lean());
  }

  async setBlockWholesale(marketId: string, blockId: string, mayorista: boolean): Promise<any> {
  this.assertMarket(marketId);
  const m = await this.marketModel.findById(marketId);
  if (!m) throw new NotFoundException('Market no encontrado');

  const changed = this.ensureBlocksIds(m);

  let b = Types.ObjectId.isValid(blockId) ? (m.blocks as any).id(blockId) : null;
  if (!b) b = (m.blocks ?? []).find((x: any) => String(x._id) === String(blockId));
  if (!b) throw new NotFoundException('Bloque no encontrado');

  b.mayorista = !!mayorista;

  await m.save();
  const out = changed ? await this.marketModel.findById(marketId).lean() : m.toObject();
  return out;
}


  
}
