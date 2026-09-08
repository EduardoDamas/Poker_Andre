import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Global ValidationPipe is registered via APP_PIPE in AppModule so the same
  // rules apply in e2e tests.
  app.enableCors();

  // Serve the built admin panel (SPA) at /panel. Resolution mirrors the legal
  // dir: dist/../panel inside the Docker image, or admin/dist in a local checkout.
  const panelDir = [
    join(__dirname, '..', 'panel'),
    join(__dirname, '..', '..', 'admin', 'dist'),
  ].find((d) => existsSync(d));
  if (panelDir) {
    app.useStaticAssets(panelDir, { prefix: '/panel' });
    // Express static serves index.html at /panel/ but not the slashless /panel.
    app
      .getHttpAdapter()
      .getInstance()
      .get('/panel', (_req: Request, res: Response) => res.redirect(301, '/panel/'));
  }

  const port = process.env.PORT ?? 3000;
  // Bind to 0.0.0.0 so the container is reachable on hosting platforms.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`CAPA CONTEST backend listening on port ${port}`);
}
bootstrap();
