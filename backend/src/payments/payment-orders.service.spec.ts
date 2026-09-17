import { PrismaClient } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { InfinitePayClient } from './infinitepay.client';
import { PaymentOrdersService, parseWebhook } from './payment-orders.service';
import { resetDb } from '../test-utils/reset-db';
import { PlayerLimitService } from '../responsible/player-limit.service';
import { SubscriptionRequestService } from './subscription-request.service';

describe('parseWebhook', () => {
  const OLD = process.env.INFINITEPAY_WEBHOOK_TRUST_RECEIPT;
  afterEach(() => {
    if (OLD === undefined) delete process.env.INFINITEPAY_WEBHOOK_TRUST_RECEIPT;
    else process.env.INFINITEPAY_WEBHOOK_TRUST_RECEIPT = OLD;
  });

  it('reads order_nsu + paid from a "paid" status', () => {
    expect(parseWebhook({ order_nsu: 'dep_1', status: 'paid', amount: 2000 })).toEqual({
      orderNsu: 'dep_1',
      paid: true,
      failed: false,
      amountCents: 2000,
    });
  });

  it('treats failed statuses as failed, not paid', () => {
    const r = parseWebhook({ orderNsu: 'dep_2', status: 'refused' });
    expect(r.paid).toBe(false);
    expect(r.failed).toBe(true);
  });

  it('is not paid for an unknown status by default', () => {
    expect(parseWebhook({ order_nsu: 'dep_3', status: 'pending' }).paid).toBe(false);
  });

  it('honors TRUST_RECEIPT for non-failed unknown statuses', () => {
    process.env.INFINITEPAY_WEBHOOK_TRUST_RECEIPT = '1';
    expect(parseWebhook({ order_nsu: 'dep_4', status: 'pending' }).paid).toBe(true);
    expect(parseWebhook({ order_nsu: 'dep_4', status: 'declined' }).paid).toBe(false);
  });
});

describe('PaymentOrdersService (webhook crediting)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let wallet: WalletService;
  let svc: PaymentOrdersService;
  let counter = 0;

  const infinitepayStub = {
    createCheckoutLink: jest.fn(async ({ orderNsu }: { orderNsu: string }) => ({
      url: `https://link.infinitepay.io/${orderNsu}`,
      orderNsu,
    })),
  } as unknown as InfinitePayClient;

  beforeAll(() => {
    process.env.INFINITEPAY_WEBHOOK_SECRET = 'hook-secret';
    process.env.INFINITEPAY_HANDLE = 'andre-luiz-g4j';
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    svc = new PaymentOrdersService(
      prisma as unknown as PrismaService,
      wallet,
      infinitepayStub,
      new PlayerLimitService(prisma as unknown as PrismaService),
      new SubscriptionRequestService(prisma as unknown as PrismaService),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function newUser(): Promise<string> {
    counter += 1;
    const u = await prisma.user.create({
      data: {
        phone: `+5511977700${counter.toString().padStart(3, '0')}`,
        displayName: `P${counter}`,
        cpf: `6000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    return u.id;
  }

  async function balanceOf(userId: string): Promise<bigint> {
    const acc = await prisma.account.findUnique({ where: { userId } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  async function pendingOrder(userId: string, amountCents: number, nsu: string) {
    await prisma.paymentOrder.create({
      data: { orderNsu: nsu, userId, amountCents: BigInt(amountCents), status: 'PENDING' },
    });
  }

  it('createDeposit records a PENDING order and returns a checkout link', async () => {
    const userId = await newUser();
    const res = await svc.createDeposit(userId, 5000);
    expect(res.url).toContain('link.infinitepay.io');
    const order = await prisma.paymentOrder.findUnique({ where: { orderNsu: res.orderNsu } });
    expect(order?.status).toBe('PENDING');
    expect(order?.amountCents).toBe(5000n);
  });

  describe('deposit bounds', () => {
    const OLD_MAX = process.env.MAX_DEPOSIT_CENTS;
    afterEach(() => {
      if (OLD_MAX === undefined) delete process.env.MAX_DEPOSIT_CENTS;
      else process.env.MAX_DEPOSIT_CENTS = OLD_MAX;
    });

    it('allows a deposit big enough for a Nível 7 entry (R$12.500 on card)', async () => {
      const userId = await newUser();
      const res = await svc.createDeposit(userId, 12_500_00);
      expect(res.amountCents).toBe(12_500_00);
    });

    it('accepts the R$20.000 ceiling and rejects a cent over it', async () => {
      const userId = await newUser();
      await expect(svc.createDeposit(userId, 20_000_00)).resolves.toBeDefined();
      await expect(svc.createDeposit(userId, 20_000_01)).rejects.toThrow(/R\$ 20\.000,00/);
    });

    it('rejects below the R$1 floor, and says the range in BRL', async () => {
      const userId = await newUser();
      await expect(svc.createDeposit(userId, 99)).rejects.toThrow(
        /Depósito entre R\$ 1,00 e R\$ 20\.000,00/,
      );
    });

    it('MAX_DEPOSIT_CENTS overrides the ceiling without a code change', async () => {
      const userId = await newUser();
      process.env.MAX_DEPOSIT_CENTS = String(50_000_00);
      await expect(svc.createDeposit(userId, 30_000_00)).resolves.toBeDefined();
      await expect(svc.createDeposit(userId, 60_000_00)).rejects.toThrow(/R\$ 50\.000,00/);
    });

    it('ignores a malformed override and keeps the default ceiling', async () => {
      const userId = await newUser();
      process.env.MAX_DEPOSIT_CENTS = 'muito';
      await expect(svc.createDeposit(userId, 20_000_00)).resolves.toBeDefined();
      await expect(svc.createDeposit(userId, 20_000_01)).rejects.toThrow(/R\$ 20\.000,00/);
    });
  });

  describe('subscription checkout (Opção 2 — automatic release)', () => {
    let subs: SubscriptionRequestService;

    beforeAll(() => {
      subs = new SubscriptionRequestService(prisma as unknown as PrismaService);
    });

    async function pendingSubscription(userId: string, plan = 'ANNUAL') {
      const req = await subs.request(userId, plan);
      const order = await svc.createSubscriptionCheckout({
        requestId: req.id,
        userId,
        plan,
        amountCents: Number(req.amountCents),
      });
      await subs.attachOrder(req.id, order.orderNsu, order.url);
      return { req, order };
    }

    it('mints a per-player order carrying the plan price', async () => {
      const userId = await newUser();
      const { order } = await pendingSubscription(userId);
      const row = await prisma.paymentOrder.findUnique({ where: { orderNsu: order.orderNsu } });
      expect(row).toMatchObject({ purpose: 'SUBSCRIPTION', status: 'PENDING', amountCents: 150000n });
      expect(order.orderNsu.startsWith('sub_')).toBe(true);
    });

    it('a paid webhook releases the plan and moves NO money', async () => {
      const userId = await newUser();
      const { order } = await pendingSubscription(userId);

      const res = await svc.handleInfinitePayWebhook(
        { order_nsu: order.orderNsu, status: 'paid', amount: 150000 },
        'hook-secret',
      );

      expect(res).toEqual({ ok: true, credited: false });
      expect(await balanceOf(userId)).toBe(0n); // a plan, not wallet balance
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.subscription).toBe('ANNUAL');
      expect(user?.subscriptionUntil).not.toBeNull();
    });

    it('the released request leaves the admin queue as CONFIRMED', async () => {
      const userId = await newUser();
      const { req, order } = await pendingSubscription(userId, 'MONTHLY');
      await svc.handleInfinitePayWebhook(
        { order_nsu: order.orderNsu, status: 'paid', amount: 25000 },
        'hook-secret',
      );

      const after = await prisma.subscriptionRequest.findUnique({ where: { id: req.id } });
      expect(after?.status).toBe('CONFIRMED');
      expect(await subs.list('REQUESTED')).toHaveLength(0);
    });

    it('a duplicate webhook does not extend the plan twice', async () => {
      const userId = await newUser();
      const { order } = await pendingSubscription(userId, 'MONTHLY');
      const payload = { order_nsu: order.orderNsu, status: 'paid', amount: 25000 };

      await svc.handleInfinitePayWebhook(payload, 'hook-secret');
      const first = await prisma.user.findUnique({ where: { id: userId } });
      await svc.handleInfinitePayWebhook(payload, 'hook-secret');
      const second = await prisma.user.findUnique({ where: { id: userId } });

      expect(second?.subscriptionUntil).toEqual(first?.subscriptionUntil);
    });

    it('a wrong amount does not release the plan', async () => {
      const userId = await newUser();
      const { order } = await pendingSubscription(userId);
      await svc.handleInfinitePayWebhook(
        { order_nsu: order.orderNsu, status: 'paid', amount: 100 },
        'hook-secret',
      );
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.subscription).toBe('NONE');
    });

    it('a failed payment leaves the request open for another try', async () => {
      const userId = await newUser();
      const { req, order } = await pendingSubscription(userId);
      await svc.handleInfinitePayWebhook(
        { order_nsu: order.orderNsu, status: 'refused' },
        'hook-secret',
      );
      const after = await prisma.subscriptionRequest.findUnique({ where: { id: req.id } });
      expect(after?.status).toBe('REQUESTED');
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.subscription).toBe('NONE');
    });
  });

  it('credits the wallet once on a paid webhook, and is idempotent', async () => {
    const userId = await newUser();
    await pendingOrder(userId, 3000, 'dep_paid');

    const first = await svc.handleInfinitePayWebhook(
      { order_nsu: 'dep_paid', status: 'paid', amount: 3000 },
      'hook-secret',
    );
    expect(first.credited).toBe(true);
    expect(await balanceOf(userId)).toBe(3000n);

    // duplicate delivery → no double credit
    const second = await svc.handleInfinitePayWebhook(
      { order_nsu: 'dep_paid', status: 'paid', amount: 3000 },
      'hook-secret',
    );
    expect(second.credited).toBe(false);
    expect(await balanceOf(userId)).toBe(3000n);
  });

  it('rejects a webhook with the wrong token (no credit)', async () => {
    const userId = await newUser();
    await pendingOrder(userId, 3000, 'dep_badtok');
    await expect(
      svc.handleInfinitePayWebhook({ order_nsu: 'dep_badtok', status: 'paid' }, 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await balanceOf(userId)).toBe(0n);
  });

  it('does not credit when the webhook amount mismatches the order', async () => {
    const userId = await newUser();
    await pendingOrder(userId, 3000, 'dep_mismatch');
    const r = await svc.handleInfinitePayWebhook(
      { order_nsu: 'dep_mismatch', status: 'paid', amount: 9999 },
      'hook-secret',
    );
    expect(r.credited).toBe(false);
    expect(await balanceOf(userId)).toBe(0n);
  });

  it('ignores an unknown order', async () => {
    const r = await svc.handleInfinitePayWebhook(
      { order_nsu: 'does_not_exist', status: 'paid' },
      'hook-secret',
    );
    expect(r).toEqual({ ok: true, credited: false });
  });

  it('marks the order FAILED on a failed webhook (no credit)', async () => {
    const userId = await newUser();
    await pendingOrder(userId, 3000, 'dep_fail');
    const r = await svc.handleInfinitePayWebhook(
      { order_nsu: 'dep_fail', status: 'refused' },
      'hook-secret',
    );
    expect(r.credited).toBe(false);
    expect(await balanceOf(userId)).toBe(0n);
    const order = await prisma.paymentOrder.findUnique({ where: { orderNsu: 'dep_fail' } });
    expect(order?.status).toBe('FAILED');
  });
});
