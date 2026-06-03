import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Global ValidationPipe is registered via APP_PIPE in AppModule so the same
  // rules apply in e2e tests.
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  // Bind to 0.0.0.0 so the container is reachable on hosting platforms.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`CAPA CONTEST backend listening on port ${port}`);
}
bootstrap();
