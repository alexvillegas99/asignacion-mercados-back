import { Request } from 'express';
import { Strategy } from 'passport-local';

import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'username',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, username: string, password: string): Promise<any> {
    const user = await this.authService.validateUser({ username, password });
    if (!user) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    return user;
  }
}
