import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The web app (a different origin in development) calls this API from the browser. Only the
  // origins listed in CORS_ORIGIN (comma separated) are allowed. Never '*'. Tokens travel in the
  // Authorization header, not in cookies, so credentials are not enabled. Nothing is allowed
  // when CORS_ORIGIN is empty or missing.
  const origins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    });
  }

  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
