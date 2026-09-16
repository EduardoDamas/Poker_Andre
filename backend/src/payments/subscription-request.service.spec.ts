import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { SubscriptionRequestService, PLAN_DAYS } from './subscription-request.service';
import { SUBSCRIPTION_LINKS } from '../tournament/payment-links';
import { subscriptionPriceCents } from '../tournament/subscription';

describe('SubscriptionRequestService (fixed-link purchase, admin confirms)', () => {
  let prisma: PrismaClient;
  let service: SubscriptionRequestService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    service = new SubscriptionRequestService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function user(): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+5511955500${counter.toString().padStart(3, '0')}`,
        displayName: `S${counter}`,
        cpf: `5000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
        status: 'ACTIVE',
      },
    });
    return u.id;
  }

  const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);

  it('records the intent and returns the merchant link for the plan', async () => {
    const u = await user();
    const req = await service.request(u, 'ANNUAL');
    expect(req.status).toBe('REQUESTED');
    expect(req.plan).toBe('ANNUAL');
    expect(req.amountCents).toBe(150000n); // R$1.500 no cartão
    expect(req.checkoutUrl).toContain('link.infinitepay.io');
  });

  it('does not grant the plan before the admin confirms', async () => {
    const u = await user();
    await service.request(u, 'MONTHLY');
    const after = await prisma.user.findUnique({ where: { id: u } });
    expect(after?.subscription).toBe('NONE');
    expect(after?.subscriptionUntil).toBeNull();
  });

  it('reuses the open request instead of queueing duplicates', async () => {
    const u = await user();
    const first = await service.request(u, 'MONTHLY');
    const again = await service.request(u, 'MONTHLY');
    expect(again.id).toBe(first.id);
    expect(await prisma.subscriptionRequest.count({ where: { userId: u } })).toBe(1);
  });

  it('retargets the open request when the player switches plan before paying', async () => {
    const u = await user();
    const first = await service.request(u, 'MONTHLY');
    const switched = await service.request(u, 'SEMIANNUAL');
    expect(switched.id).toBe(first.id);
    expect(switched.plan).toBe('SEMIANNUAL');
    expect(switched.amountCents).toBe(112500n);
    expect(await prisma.subscriptionRequest.count({ where: { userId: u } })).toBe(1);
  });

  it('confirm grants the plan for its full term', async () => {
    const u = await user();
    const req = await service.request(u, 'QUARTERLY');
    const confirmed = await service.confirm(req.id, 'pago no cartão');
    const after = await prisma.user.findUnique({ where: { id: u } });

    expect(confirmed.status).toBe('CONFIRMED');
    expect(after?.subscription).toBe('QUARTERLY');
    expect(daysBetween(after!.subscriptionUntil!, new Date())).toBe(PLAN_DAYS.QUARTERLY);
    expect(confirmed.grantedUntil).toEqual(after?.subscriptionUntil);
  });

  it('renewal extends from the current expiry — paid days are never lost', async () => {
    const u = await user();
    const first = await service.request(u, 'MONTHLY');
    await service.confirm(first.id);
    const second = await service.request(u, 'MONTHLY');
    await service.confirm(second.id);

    const after = await prisma.user.findUnique({ where: { id: u } });
    expect(daysBetween(after!.subscriptionUntil!, new Date())).toBe(2 * PLAN_DAYS.MONTHLY);
  });

  it('an expired subscription restarts from today, not from the old expiry', async () => {
    const u = await user();
    await prisma.user.update({
      where: { id: u },
      data: { subscription: 'MONTHLY', subscriptionUntil: new Date(Date.now() - 10 * 86_400_000) },
    });
    const req = await service.request(u, 'MONTHLY');
    await service.confirm(req.id);

    const after = await prisma.user.findUnique({ where: { id: u } });
    expect(daysBetween(after!.subscriptionUntil!, new Date())).toBe(PLAN_DAYS.MONTHLY);
  });

  it('reject settles the request and grants nothing', async () => {
    const u = await user();
    const req = await service.request(u, 'ANNUAL');
    const rejected = await service.reject(req.id, 'pagamento não localizado');

    expect(rejected.status).toBe('REJECTED');
    const after = await prisma.user.findUnique({ where: { id: u } });
    expect(after?.subscription).toBe('NONE');
  });

  it('a settled request cannot be confirmed or rejected twice', async () => {
    const u = await user();
    const req = await service.request(u, 'ANNUAL');
    await service.confirm(req.id);
    await expect(service.confirm(req.id)).rejects.toThrow(/já está CONFIRMED/);
    await expect(service.reject(req.id)).rejects.toThrow(/já está CONFIRMED/);
  });

  it('rejects the free tier and unknown plans', async () => {
    const u = await user();
    await expect(service.request(u, 'NONE')).rejects.toThrow(/inválido/i);
    await expect(service.request(u, 'WEEKLY')).rejects.toThrow(/Sem link/);
  });

  it('the admin queue shows who to credit (name + phone + amount)', async () => {
    const u = await user();
    await service.request(u, 'MONTHLY');
    const queue = await service.list('REQUESTED');
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ userId: u, plan: 'MONTHLY', amountCents: '25000', status: 'REQUESTED' });
    expect(queue[0].phone).toMatch(/^\+55/);
    expect(queue[0].displayName).toBeTruthy();
  });

  it('every merchant link charges the plan price + the 25% card surcharge', () => {
    expect(SUBSCRIPTION_LINKS).toHaveLength(4);
    for (const link of SUBSCRIPTION_LINKS) {
      const expected = (subscriptionPriceCents(link.plan) * 125n) / 100n;
      expect(BigInt(link.amountCents)).toBe(expected);
      // The amount is also spelled out in the merchant URL (…-250,00).
      const inUrl = `${(link.amountCents / 100).toFixed(2).replace('.', ',')}`;
      expect(link.url.endsWith(inUrl)).toBe(true);
    }
  });
});
