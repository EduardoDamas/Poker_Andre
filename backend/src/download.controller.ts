import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PromoService, promoOpensAt } from './promo/promo.service';
import { promoPrizeLine, promoTime, promoWhenLong } from './promo/promo-format';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Public (no-auth) install/download page for the direct-link APK distribution.
 *   GET /baixar (alias /download) → branded install page.
 * The page's download button links to the GitHub Release asset, so the backend
 * does not serve the (large) APK itself.
 *
 * Resolution mirrors the legal dir: public/ inside the Docker image, or the repo
 * docs/marketing checkout in local dev.
 *
 * The next scheduled promotion is rendered into the page (at <!--PROMO-->), on
 * the server so it shows without JavaScript, with the prize stated as it is paid.
 */
@Controller()
export class DownloadController {
  constructor(private readonly promo: PromoService) {}

  private async promoCard(): Promise<string> {
    const [event] = await this.promo.announcedEvents();
    if (!event) return '';
    const opens = promoTime(promoOpensAt(event));
    return `
  <section class="promo" id="torneio">
    <div class="promo-tag">TORNEIO GRÁTIS</div>
    <h2>${escapeHtml(event.name)}</h2>
    <p class="promo-when">${promoWhenLong(event.startsAt)} (horário de Brasília)</p>
    <ul>
      <li><b>Entrada grátis</b> · ${event.maxPlayers} vagas</li>
      <li>${promoPrizeLine(event)}</li>
      <li>A sala abre no app às ${opens}. As vagas são de quem entrar primeiro — mantenha o app aberto até o início.</li>
      <li>Mesas de até 10 jogadores; os vencedores de cada mesa disputam a mesa final.</li>
    </ul>
  </section>`;
  }

  private page(): string {
    const candidates = [
      join(__dirname, '..', 'public', 'install.html'),
      join(__dirname, '..', '..', 'docs', 'marketing', 'install.html'),
    ];
    const file = candidates.find((f) => existsSync(f));
    if (!file) throw new NotFoundException('Página indisponível.');
    return readFileSync(file, 'utf8');
  }

  private async render(): Promise<string> {
    return this.page().replace('<!--PROMO-->', await this.promoCard());
  }

  @Get('baixar')
  @Header('Content-Type', 'text/html; charset=utf-8')
  baixar(): Promise<string> {
    return this.render();
  }

  @Get('download')
  @Header('Content-Type', 'text/html; charset=utf-8')
  download(): Promise<string> {
    return this.render();
  }
}
