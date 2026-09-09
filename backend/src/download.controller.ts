import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Public (no-auth) install/download page for the direct-link APK distribution.
 *   GET /baixar (alias /download) → branded install page.
 * The page's download button links to the GitHub Release asset, so the backend
 * does not serve the (large) APK itself.
 *
 * Resolution mirrors the legal dir: public/ inside the Docker image, or the repo
 * docs/marketing checkout in local dev.
 */
@Controller()
export class DownloadController {
  private page(): string {
    const candidates = [
      join(__dirname, '..', 'public', 'install.html'),
      join(__dirname, '..', '..', 'docs', 'marketing', 'install.html'),
    ];
    const file = candidates.find((f) => existsSync(f));
    if (!file) throw new NotFoundException('Página indisponível.');
    return readFileSync(file, 'utf8');
  }

  @Get('baixar')
  @Header('Content-Type', 'text/html; charset=utf-8')
  baixar(): string {
    return this.page();
  }

  @Get('download')
  @Header('Content-Type', 'text/html; charset=utf-8')
  download(): string {
    return this.page();
  }
}
