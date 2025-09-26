import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';

import { urlencoded, json } from 'express';
import { NODE_ENV, PORT } from './config/config.env';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as https from 'https';
import { join } from 'path';
import * as express from 'express';
import { LogsService } from './logs/logs.service';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import { cacheControlMiddleware } from './common/middleware/middleware';
import { initSwagger } from './app.swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { IpInterceptor } from './common/ip/ip.interceptor';

async function bootstrap() {
  const server = express();

  const logger = new Logger();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(server),
  );
  //tamaño de json
  app.use(json({ limit: '150mb' }));
  app.use(urlencoded({ extended: true, limit: '150mb' }));
  //Cors
  app.enableCors();
  //Prefijo Global de la api
  app.setGlobalPrefix('api');
  // Configuración de CORS
  app.enableCors({
    origin: ['*'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept',
    credentials: true,
  });
  // Aplicar filtro de excepciones global
  const logsService = app.get(LogsService);
  app.useGlobalFilters(new HttpExceptionFilter(logsService));
  app.useGlobalInterceptors(new IpInterceptor());
  // Middleware para cabeceras de caché
  server.use(cacheControlMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const config = app.get(ConfigService);
  const port = config.get(PORT);

  const nodeEnv = config.get(NODE_ENV);

  initSwagger(app);

  await app.listen(port);

  logger.log(`Running in ${nodeEnv} mode`);
  /*   logger.log(`App https running in ${serverHttps.address()['port']}/api`); */
  logger.log(`App running in ${await app.getUrl()}/api`);
  logger.log(`Swagger running in ${await app.getUrl()}/docs`);
  logger.log(`Version 1.0.0`);
}
bootstrap();
