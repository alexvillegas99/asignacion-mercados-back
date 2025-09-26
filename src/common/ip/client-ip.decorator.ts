// src/common/ip/client-ip.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest() as Request & { clientIp?: string };
    return req.clientIp || (
      (req as any).headers?.['x-forwarded-for']?.split(',')[0].trim()
      || (req as any).ip
      || (req as any).socket?.remoteAddress
      || (req as any).connection?.remoteAddress
      || '0.0.0.0'
    );
  },
);
