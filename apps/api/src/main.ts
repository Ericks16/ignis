import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './app.setup';
import { loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv(); // falla rápido si la configuración es inválida
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  if (env.NODE_ENV !== 'production') setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
bootstrap();
