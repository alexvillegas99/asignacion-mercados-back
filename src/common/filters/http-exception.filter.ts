import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { LogsService } from '../../logs/logs.service';
import { Log } from '../../logs/schemas/log.schema';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logsService: LogsService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let message: any = 'Error interno del servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception instanceof Error) {
      message = exception.message || 'Error interno del servidor';
      console.error('🔥 ERROR INESPERADO 🔥');
      console.error(`🛑 Método: ${request.method}`);
      console.error(`🔗 Endpoint: ${request.url}`);
      console.error(`📜 Mensaje:`, message);
      console.error(`📌 Stack Trace:`, exception.stack);
    } else {
      exception = new InternalServerErrorException();
    }

    // 📌 Filtrar datos sensibles antes de guardar en logs
    const sanitizedBody = { ...request.body };
    if (sanitizedBody.password) sanitizedBody.password = '***'; // 🔒 No guardamos contraseñas
    if (sanitizedBody.token) sanitizedBody.token = '***'; // 🔒 No guardamos tokens

    // 📌 Guardar error en MongoDB
    const log: Partial<Log> = {
      statusCode: status,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      method: request.method,
      path: request.url,
      requestBody: sanitizedBody, // 📌 Guardamos el cuerpo de la petición
      requestHeaders: request.headers, // 📌 Guardamos los headers
      stackTrace: exception instanceof Error ? exception.stack : undefined,
      timestamp: new Date(),
    };
    await this.logsService.createLog(log);

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: log.timestamp!.toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
