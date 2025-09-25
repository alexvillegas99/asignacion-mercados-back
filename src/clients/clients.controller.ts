import { Response } from 'express';
import { Controller, Get, Post, Body, Patch, Param, Res, Logger } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto, SignInClientDto, UpdateClientDto } from './dto';

@Controller('clients')
export class ClientsController {
  private readonly logger = new Logger(ClientsController.name);

  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  async create(@Body() createClientDto: CreateClientDto, @Res() res: Response) {
    this.logger.log('Creating a new client');
    const user = await this.clientsService.create(createClientDto);
    return res.status(201).json(user);
  }

  @Post('sign-in')
  async signIn(@Body() signInClientDto: SignInClientDto, @Res() res: Response) {
    this.logger.log('Signing in client');
    const user = await this.clientsService.login(signInClientDto);
    return res.status(200).json(user);
  }

  @Get()
  async findAll(@Res() res: Response) {
    this.logger.log('Fetching all clients');
    const clients = await this.clientsService.findAll();
    return res.status(200).json(clients);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    this.logger.log(`Fetching client with id: ${id}`);
    const client = await this.clientsService.findOne({ id });
    return res.status(200).json(client);
  }

  @Get('identity-card/:identityCard')
  async findByIdentityCard(@Param('identityCard') identityCard: string, @Res() res: Response) {
    this.logger.log(`Fetching client with identity card: ${identityCard}`);
    const client = await this.clientsService.findOne({ identityCard });
    return res.status(200).json(client);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateClientDto: UpdateClientDto,
    @Res() res: Response,
  ) {
    this.logger.log(`Updating client with id: ${id}`);
    const client = await this.clientsService.update(id, updateClientDto);

    return res.status(200).json(client);
  }
}
