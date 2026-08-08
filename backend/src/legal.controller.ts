import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Public (no-auth) hosting of the finalized legal documents, so the Play Store
 * privacy-policy URL and the in-app links resolve to a real page.
 *   GET /legal/privacidade  → Política de Privacidade
 *   GET /legal/termos       → Termos de Uso
 *   GET /legal/regulamento  → Regulamento dos Torneios
 *
 * Resolution order (first existing dir wins):
 *   1. LEGAL_DIR env override
 *   2. backend/legal — bundled inside the Docker image (dist/.. → backend root)
 *   3. repo docs/legal/final — local dev checkout (dist/../.. → repo root)
 */
@Controller('legal')
export class LegalController {
  private readonly dir = this.resolveDir();

  private resolveDir(): string {
    const candidates = [
      process.env.LEGAL_DIR,
      join(__dirname, '..', 'legal'),
      join(__dirname, '..', '..', 'docs', 'legal', 'final'),
    ].filter((d): d is string => !!d);
    return candidates.find((d) => existsSync(d)) ?? candidates[candidates.length - 1];
  }

  private serve(file: string): string {
    try {
      return readFileSync(join(this.dir, file), 'utf8');
    } catch {
      throw new NotFoundException('Documento indisponível.');
    }
  }

  @Get('privacidade')
  @Header('Content-Type', 'text/html; charset=utf-8')
  privacidade(): string {
    return this.serve('POLITICA_DE_PRIVACIDADE.html');
  }

  @Get('termos')
  @Header('Content-Type', 'text/html; charset=utf-8')
  termos(): string {
    return this.serve('TERMOS_DE_USO.html');
  }

  @Get('regulamento')
  @Header('Content-Type', 'text/html; charset=utf-8')
  regulamento(): string {
    return this.serve('REGULAMENTO_DOS_TORNEIOS.html');
  }
}
