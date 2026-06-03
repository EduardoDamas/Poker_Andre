import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Global ValidationPipe is registered via APP_PIPE in AppModule so the same
  // rules apply in e2e tests.
  app.enableCors();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`CAPA CONTEST backend listening on http://localhost:${port}`);
}
bootstrap();
