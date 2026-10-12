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

  // The app in the browser (client, 2026-10-12: iPhone players, and no Android
  // "unknown apps" warning) at /jogar. Same resolution as the panel:
  // dist/../web in the image, or mobile/build/web in a local checkout.
  // no-cache = revalidate on every load (cheap 304s), so a release reaches
  // players at once — Flutter's file names carry no version hash.
  const webDir = [
    join(__dirname, '..', 'web'),
    join(__dirname, '..', '..', 'mobile', 'build', 'web'),
  ].find((d) => existsSync(d));
  if (webDir) {
    app.useStaticAssets(webDir, {
      prefix: '/jogar',
      setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
    });
    app
      .getHttpAdapter()
      .getInstance()
      .get('/jogar', (_req: Request, res: Response) => res.redirect(301, '/jogar/'));
  }

  const port = process.env.PORT ?? 3000;
  // Bind to 0.0.0.0 so the container is reachable on hosting platforms.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`CAPA CONTEST backend listening on port ${port}`);
}
bootstrap();
