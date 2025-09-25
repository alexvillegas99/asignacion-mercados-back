import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RoleProtected } from './role-protected.decorator';
import { UserRoleGuard } from '../guards';
import { Role } from '../../common/enums';

export function Authentication(...roles: Role[]) {
  return applyDecorators(
    RoleProtected(...roles),
    UseGuards(AuthGuard(), UserRoleGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      description: 'No tienes permisos para realizar esta acción',
    }),
  );
}
