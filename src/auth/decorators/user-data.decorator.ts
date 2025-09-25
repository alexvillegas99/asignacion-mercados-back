import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

export const UserData = createParamDecorator((data: string, ctx: ExecutionContext) => {
  const logger = new Logger('UserData');
  const request = ctx.switchToHttp().getRequest();
  const user = request.user;

  if (!user) {
    logger.error(
      'No se ha encontrado el usuario en el request, revisar si el método usa el decorador de autenticación',
    );
    throw new InternalServerErrorException('No se ha encontrado el usuario');
  }

  return data ? user && user[data] : user;
});
