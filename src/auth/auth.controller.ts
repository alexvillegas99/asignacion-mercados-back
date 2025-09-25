import { Response } from 'express';
import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SignInDto } from './dto';
import { LocalAuthGuard } from './guards';
import { AuthService } from './auth.service';
import { Authentication, UserData } from './decorators';
import { User } from '../users/entities/user.entity';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  //@UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Body() signInDto: SignInDto) {
    this.logger.log(`Iniciando sesion de ${signInDto.username}`);
    const result = await this.authService.loginDirect(signInDto);
    return result;
  }

  @Authentication()
  @Get('profile')
  getProfile(@UserData() user: User) {
    return user;
  }


}
