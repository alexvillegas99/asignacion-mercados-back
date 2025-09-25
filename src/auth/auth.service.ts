// src/auth/auth.service.ts
import * as bcrypt from 'bcrypt';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { SignInDto } from './dto';
import { UsersService } from '../users/users.service';
import { JWT_EXPIRES_IN, JWT_SECRET } from 'src/config/config.env';

type UserWithPassword = {
  _id: any;
  email: string;
  nombre: string;
  roles: string[];
  telefono?: string;
  password: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Valida credenciales y retorna el usuario (sin password).
   */
  async validateUser(signInDto: SignInDto) {
    const { username, password } = signInDto;

    // Trae usuario activo + password (UsersService ya hace select('+password'))
    const user = (await this.usersService.validateOne({ email: username })) as
      | UserWithPassword
      | undefined;

    if (!user) return null;

    this.logger.log(`Validating user: ${username}`);

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn(`Invalid password for user: ${username}`);
      return null;
    }

    this.logger.log(`User ${username} validated successfully`);

    // Quitar password y mapear _id -> id
    const { password: _pw, _id, ...safe } = user;
    return {
      id: String(_id),
      username: user.email,
      nombre: user.nombre,
      roles: user.roles,
      telefono: user.telefono,
      email: user.email,
    };
  }

  /**
   * Emite JWT definitivo y retorna usuario sin password.
   */
  async login(user: {
    id: string;
    username: string;
    nombre: string;
    roles: string[];
    telefono?: string;
    email?: string;
  }) {
    const payload = { user: user.username, sub: user.id };
    return {
      accessToken: await this.jwtService.signAsync(payload, {
        secret: JWT_SECRET,
        expiresIn: '365d', // e.g. '1d'
      }),
      user, // ya viene sin password
    };
  }

  /**
   * (Opcional) Login directo en un paso: valida y si está bien devuelve token+user.
   */
  async loginDirect(signInDto: SignInDto) {
    const validated = await this.validateUser(signInDto);
    if (!validated) {
      throw new BadRequestException('Credenciales inválidas');
    }
    return this.login(validated);
  }
}
