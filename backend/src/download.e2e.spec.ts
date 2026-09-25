import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from './app.module';
import { PromoService } from './promo/promo.service';

/**
 * /baixar announces the next promotion (client campaign, 2026-09-24): date and
 * time in Brasília, free entry, places, when the room opens — and the prize as
 * it is actually paid, never a bare "R$ 500" a non-subscriber would not get.
 */
describe('Download page (e2e)', () => {
  let app: INestApplication;
  let promo: PromoService;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    promo = app.get(PromoService);
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => prisma.promoEvent.deleteMany());

  const page = async () => (await request(app.getHttpServer()).get('/baixar').expect(200)).text;
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

  it('shows no tournament card when none is scheduled', async () => {
    const html = await page();
    expect(html).toContain('Baixar aplicativo');
    expect(html).not.toContain('TORNEIO GRÁTIS');
    expect(html).not.toContain('<!--PROMO-->');
  });

  it('announces the next promotion with the prize as it is paid', async () => {
    await promo.createEvent({
      name: 'Nível 0', startsAt: inDays(3), prizeCents: 25000n, prizeSubscriberCents: 50000n,
      minPlayers: 80, maxPlayers: 100,
    });
    const html = await page();
    expect(html).toContain('TORNEIO GRÁTIS');
    expect(html).toContain('horário de Brasília');
    expect(html).toContain('<b>Entrada grátis</b> · 100 vagas');
    expect(html).toContain('R$ 500,00 para o campeão assinante');
    expect(html).toContain('R$ 250,00 para quem não é assinante');
    expect(html).toMatch(/A sala abre no app às \d\d:\d\d/);
  });

  it('one prize for everyone reads as one prize', async () => {
    await promo.createEvent({ name: 'Nível 0', startsAt: inDays(3), prizeCents: 50000n, prizeSubscriberCents: 50000n });
    expect(await page()).toContain('Prêmio de R$ 500,00 para o campeão</li>');
  });

  it('shows the soonest, skips cancelled ones, and escapes the name', async () => {
    const first = await promo.createEvent({
      name: '<b>Cancelada</b>', startsAt: inDays(1), prizeCents: 25000n, prizeSubscriberCents: 50000n,
    });
    await promo.cancel(first.id);
    await promo.createEvent({ name: 'Nível 0 & amigos', startsAt: inDays(5), prizeCents: 25000n, prizeSubscriberCents: 50000n });
    await promo.createEvent({ name: 'Depois', startsAt: inDays(9), prizeCents: 25000n, prizeSubscriberCents: 50000n });
    const html = await page();
    expect(html).toContain('<h2>Nível 0 &amp; amigos</h2>');
    expect(html).not.toContain('Cancelada');
    expect(html).not.toContain('<h2>Depois</h2>');
  });

  it('/download serves the same page', async () => {
    await promo.createEvent({ name: 'Nível 0', startsAt: inDays(2), prizeCents: 25000n, prizeSubscriberCents: 50000n });
    const res = await request(app.getHttpServer()).get('/download').expect(200);
    expect(res.text).toContain('TORNEIO GRÁTIS');
  });
});
