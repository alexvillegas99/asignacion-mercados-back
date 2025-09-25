import { Observable } from 'rxjs';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { META_ROLES } from '../decorators';

@Injectable()
export class UserRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const validRoles = this.reflector.get<string[]>(META_ROLES, context.getHandler());

    if (!validRoles || validRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as any;

    if (!user) throw new UnauthorizedException('No se ha encontrado el usuario');

    if (user.roles.some((role) => validRoles.includes(role))) {
      return true;
    }

    throw new ForbiddenException('No tienes permisos para acceder a este recurso');
  }
}
