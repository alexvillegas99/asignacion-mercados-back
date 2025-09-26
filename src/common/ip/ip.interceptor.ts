// src/common/ip/ip.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class IpInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request & { clientIp?: string }>();

    // extrae posible header x-forwarded-for (coma separated list) o req.ip / connection.remoteAddress
    const xff = (req as any).headers?.['x-forwarded-for'] as string | undefined;
    let ip: string | undefined;

    if (xff && typeof xff === 'string') {
      // puede venir "client, proxy1, proxy2" -> nos quedamos con el primero
      ip = xff.split(',')[0].trim();
    }

    if (!ip) {
      // express sets req.ip; raw Node may have socket/connection
      ip = (req as any).ip || (req as any).socket?.remoteAddress || (req as any).connection?.remoteAddress;
    }

    // Normalizar IPv6 localhost "::ffff:127.0.0.1" -> "127.0.0.1"
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

    // Attach to request so controllers/services can read it
    (req as any).clientIp = ip || '0.0.0.0';

    return next.handle();
  }
}
