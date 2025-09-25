import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { JWT_SECRET } from 'src/config/config.env';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET,
    });
  }

  async validate(payload: any) {
    const { sub } = payload;
    if (!sub) {
      throw new Error('Invalid token payload');
    }

    try {
      const user = await this.usersService.findOne({ id: sub });
      if (!user) {
        throw new UnauthorizedException('No se encuentra autenticado');
      }

      return user;
    } catch (error) {
      console.error('Error al validar el token', error);
      throw new UnauthorizedException('No se encuentra autenticado');
    }
  }
}
