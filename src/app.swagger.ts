import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export const initSwagger = (
  app: INestApplication,
  title?: string,
  description?: string,
) => {
  const swaggerConfig = new DocumentBuilder()
    .setTitle(title || 'Api Backend Asignacion Mercados')
    .setDescription(description || 'Documentación de la API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const sortedPaths = Object.keys(document.paths).sort();

  const sortedDocument = {
    ...document,
    paths: sortedPaths.reduce((acc, key) => {
      acc[key] = document.paths[key];
      return acc;
    }, {}),
  };
  SwaggerModule.setup('/docs', app, sortedDocument);
};
