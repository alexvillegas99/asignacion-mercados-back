// src/clients/clients.service.ts
import * as bcrypt from 'bcrypt';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery, Types } from 'mongoose';

import {
  CreateClientDto,
  FindClientDto,
  SignInClientDto,
  UpdateClientDto,
} from './dto';
import { Client, ClientDocument } from './entities/client.entity';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    private readonly jwtService: JwtService,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<any> {
    const identityCard = createClientDto.identityCard?.trim();
    const existingClient = await this.clientModel
      .findOne({ identityCard })
      .lean();

    if (existingClient) {
      this.logger.warn(
        `Client already exists with identityCard: ${identityCard}`,
      );
      return existingClient; // mismo comportamiento que tu versión
    }

    this.logger.log(`Creating client with identityCard: ${identityCard}`);

    if (!createClientDto.password) {
      this.logger.warn('Password is not provided, setting a default password');
      createClientDto.password = identityCard; // default password
    }

    const created = new this.clientModel({ ...createClientDto, identityCard });
    const saved = await created.save();
    this.logger.log(
      `Client created successfully with identityCard: ${saved.identityCard}`,
    );
    return saved.toJSON();
  }

  async findAll(): Promise<any[]> {
    return await this.clientModel.find().sort({ createdAt: -1 }).lean();
  }

  async findOne(findClientDto: FindClientDto): Promise<any> {
    const { identityCard, id } = findClientDto;
    const or: FilterQuery<ClientDocument>[] = [];

    if (id) or.push({ _id: new Types.ObjectId(id) } as any);
    if (identityCard) or.push({ identityCard: identityCard.trim() } as any);

    const client = await this.clientModel
      .findOne(or.length ? { $or: or } : {})
      .lean();

    if (!client) {
      this.logger.warn(
        `Client not found with identityCard: ${identityCard} or id: ${id}`,
      );
      throw new NotFoundException('No se ha encontrado el cliente');
    }

    return client;
  }

  async findOneByIdentityCard(identityCard: string): Promise<any> {
    const client = await this.clientModel
      .findOne({ identityCard: identityCard.trim() })
      .lean();
    if (!client) {
      this.logger.warn(`Client not found with identityCard: ${identityCard}`);
      throw new NotFoundException(
        `No se ha encontrado el cliente con cédula: ${identityCard}`,
      );
    }
    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto): Promise<any> {
    // Evita actualizaciones accidentales de contraseña por este endpoint
    if ('password' in updateClientDto) delete (updateClientDto as any).password;

    const updated = await this.clientModel
      .findByIdAndUpdate(id, updateClientDto, {
        new: true,
        runValidators: true,
      })
      .lean();

    if (!updated) {
      this.logger.warn(`Client not found with id: ${id}`);
      throw new NotFoundException(
        `No se ha encontrado el cliente con id: ${id}`,
      );
    }
    return updated;
  }

  async login(signInClientDto: SignInClientDto) {
    const { identityCard, password } = signInClientDto;

    const clientDoc = await this.clientModel
      .findOne({ identityCard: identityCard.trim() })
      .select('+password identityCard name address phone email') // incluye password para comparar
      .exec(); // sin .lean() para mantener tipos y getters

    if (!clientDoc) {
      this.logger.warn(`Client not found with identityCard: ${identityCard}`);
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    this.logger.log(
      `Validating password for client with identityCard: ${identityCard}`,
    );
    const isPasswordValid = await bcrypt.compare(password, clientDoc.password);

    if (!isPasswordValid) {
      this.logger.warn(
        `Invalid password for client with identityCard: ${identityCard}`,
      );
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    this.logger.log(
      `Client logged in successfully with identityCard: ${identityCard}`,
    );
    const payload = {
      user: clientDoc.identityCard,
      sub: String(clientDoc._id),
    };

    const accessToken = await this.jwtService.signAsync(payload); // usa tu configuración del JwtModule
    const client = {
      id: String(clientDoc._id),
      identityCard: clientDoc.identityCard,
      name: clientDoc.name,
      address: clientDoc.address,
      phone: clientDoc.phone,
      email: clientDoc.email,
    };

    return { accessToken, client };
  }

  async validateToken(token: string): Promise<any> {
    const decoded = await this.jwtService.verifyAsync(token); // respeta secret/config del JwtModule
    const client = await this.clientModel
      .findById(decoded.sub)
      .select('identityCard name address phone email') // solo campos públicos
      .lean();

    if (!client) {
      this.logger.warn(`Client not found with id: ${decoded.sub}`);
      throw new UnauthorizedException('Token inválido o cliente no encontrado');
    }

    // Normaliza id
    return { id: String(decoded.sub), ...client };
  }
}
