import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { PromoClassification, PromoService } from './promo.service';
import { brl, escapeHtml, promoWhenLong } from './promo-format';

/**
 * Public classification of a promotion (client, 2026-09-29): the champion
 * first, then everyone in reverse order of elimination. No login — marketing
 * links to it after the tournament. Names are shortened ("Maria S.").
 *
 *   GET /classificacao               the latest real tournament (page)
 *   GET /classificacao/:id           a given one (page)
 *   GET /promo/classification/:id    the same as JSON (for the app)
 */
@Controller()
export class ClassificationController {
  constructor(private readonly promo: PromoService) {}

  @Get('classificacao')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async latest(): Promise<string> {
    const last = await this.promo.latestClassified();
    if (!last) return page('Classificação', '<p class="muted">A classificação aparece aqui depois do torneio.</p>');
    return this.render((await this.promo.classification(last.id))!);
  }

  @Get('classificacao/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async one(@Param('id') id: string): Promise<string> {
    const c = await this.promo.classification(id);
    if (!c) throw new NotFoundException('Torneio não encontrado.');
    return this.render(c);
  }

  @Get('promo/classification/:id')
  async json(@Param('id') id: string) {
    const c = await this.promo.classification(id);
    if (!c) throw new NotFoundException('Torneio não encontrado.');
    return {
      eventId: c.event.id,
      name: c.event.name,
      startsAt: c.event.startsAt,
      players: c.event.startedWith ?? c.entries.length,
      finished: c.entries.some((e) => e.place === 1),
      entries: c.entries.map(({ place, name }) => ({ place, name })),
    };
  }

  private render(c: PromoClassification): string {
    const { event, entries } = c;
    const players = event.startedWith ?? entries.length;
    const champion = entries.find((e) => e.place === 1);
    const prize = event.prizePaidCents && event.prizePaidCents > 0n ? brl(event.prizePaidCents) : null;
    const body = `
      <p class="when">${promoWhenLong(event.startsAt)} · ${players} participantes</p>
      ${
        champion
          ? `<div class="champ"><div class="trophy">🏆</div><div><div class="label">CAMPEÃO</div>
             <div class="name">${escapeHtml(champion.name)}</div>${prize ? `<div class="prize">Prêmio ${prize}</div>` : ''}</div></div>`
          : '<p class="muted">Torneio em andamento — a classificação vai sendo preenchida.</p>'
      }
      <ol class="list">
        ${entries
          .filter((e) => e.place !== 1)
          .map((e) => `<li><span class="pos">${e.place}º</span><span>${escapeHtml(e.name)}</span></li>`)
          .join('')}
      </ol>
      <a class="btn" href="/baixar">Baixe o app e jogue o próximo torneio</a>`;
    return page(`Classificação — ${escapeHtml(event.name)}`, body);
  }
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} · CAPA CONTEST</title>
<style>
  :root{--bg:#0A0A0B;--surface:#141417;--border:#2A2B31;--crimson:#E2231A;--gold:#F5C45E;--text:#F5F6F7;--text2:#A7ABB4}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Roboto,Inter,system-ui,Arial,sans-serif;background:radial-gradient(1000px 500px at 50% -10%,#1C1C21 0%,var(--bg) 60%);color:var(--text);min-height:100vh}
  .wrap{max-width:640px;margin:0 auto;padding:28px 18px 56px}
  .wordmark{text-align:center;font-weight:900;font-style:italic;font-size:30px}
  .wordmark .a{color:var(--crimson)}
  h1{font-size:22px;margin:22px 0 4px;text-align:center}
  .when,.muted{color:var(--text2);text-align:center;font-size:14px}
  .champ{display:flex;gap:16px;align-items:center;margin:22px 0;padding:18px 20px;border:1px solid var(--gold);border-radius:18px;background:linear-gradient(180deg,#221a08,var(--surface))}
  .trophy{font-size:40px}
  .label{color:var(--gold);font-weight:800;letter-spacing:1px;font-size:12px}
  .name{font-size:22px;font-weight:800}
  .prize{color:var(--gold);font-weight:700;margin-top:2px}
  .list{list-style:none;border:1px solid var(--border);border-radius:14px;overflow:hidden}
  .list li{display:flex;gap:14px;padding:10px 16px;border-bottom:1px solid var(--border);background:var(--surface);font-size:15px}
  .list li:last-child{border-bottom:none}
  .pos{color:var(--gold);font-weight:800;min-width:44px}
  .btn{display:block;text-align:center;margin-top:24px;text-decoration:none;color:#fff;font-weight:800;padding:14px;border-radius:999px;background:linear-gradient(135deg,#FF4438,#B3140C)}
</style>
</head>
<body><div class="wrap">
  <div class="wordmark"><span class="a">CAPA</span> CONTEST</div>
  <h1>${title}</h1>
  ${body}
</div></body>
</html>`;
}
