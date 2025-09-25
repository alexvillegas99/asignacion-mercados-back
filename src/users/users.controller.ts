import { Response } from 'express';
import { Body, Controller, Get, Logger, Param, Patch, Post, Res } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Res() res: Response) {
    this.logger.log('Fetching all users');
    const users = await this.usersService.findAll();
    this.logger.log(`Found ${users.length} users`);
    return res.status(200).json(users);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    this.logger.log(`Fetching user with id: ${id}`);
    const user = await this.usersService.findOne({ id });
    return res.status(200).json(user);
  }

  @Post()
  async create(@Res() res: Response, @Body() createUserDto: CreateUserDto) {
    this.logger.log('Creating a new user');
    const newUser = await this.usersService.create(createUserDto);
    return res.status(201).json(newUser);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Res() res: Response,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    this.logger.log(`Updating user with id: ${id}`);
    const updatedUser = await this.usersService.update(id, updateUserDto);
    return res.status(200).json(updatedUser);
  }
}
