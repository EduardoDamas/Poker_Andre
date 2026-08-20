import { PrismaClient } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { InfinitePayClient } from './infinitepay.client';
import { PaymentOrdersService, parseWebhook } from './payment-orders.service';
import { resetDb } from '../test-utils/reset-db';

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
    svc = new PaymentOrdersService(prisma as unknown as PrismaService, wallet, infinitepayStub);
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
