import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { corsOptions } from './config/cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(corsOptions(process.env.WEB_ORIGIN));
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
