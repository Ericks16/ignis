import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { loadEnv } from './config/env';

/** Configuración común a la aplicación real y a los tests. */
export function configureApp(app: INestApplication) {
  const env = loadEnv();
  (app as any).set?.('trust proxy', 1); // detrás del proxy de Render/Cloudflare
  (app as unknown as { useBodyParser?: (t: string, o: object) => void }).useBodyParser?.('json', { limit: '1mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.corsOrigins, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api', { exclude: ['health', 'health/ready'] });
}

export function setupSwagger(app: INestApplication) {
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('IGNIS Maintenance Manager API').setVersion('0.1.0').build());
  SwaggerModule.setup('docs', app, doc);
}
