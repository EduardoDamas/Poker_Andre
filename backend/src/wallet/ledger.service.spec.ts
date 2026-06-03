import { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';

/**
 * STEP A1 gate — double-entry ledger invariants.
 * Runs against the real test database (see jest globalSetup).
 */
describe('LedgerService (double-entry invariants)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let externalId: string;
  let playerId: string;

  beforeAll(() => {
    prisma = new PrismaClient();
    // LedgerService only needs the PrismaClient surface; PrismaService extends it.
    ledger = new LedgerService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Clean slate before each test, then create the two accounts we post between.
  beforeEach(async () => {
    await resetDb(prisma);

    const external = await prisma.account.create({ data: { type: 'EXTERNAL' } });
    const player = await prisma.account.create({ data: { type: 'PLAYER' } });
    externalId = external.id;
    playerId = player.id;
  });

  it('posts a balanced transaction and moves both balances', async () => {
    // Deposit R$100,00 = 10000 cents: money flows from EXTERNAL into PLAYER.
    await ledger.post({
      kind: 'DEPOSIT',
      postings: [
        { accountId: externalId, amountCents: -10000n },
        { accountId: playerId, amountCents: 10000n },
      ],
    });

    expect(await ledger.balanceOf(playerId)).toBe(10000n);
    expect(await ledger.balanceOf(externalId)).toBe(-10000n);
  });

  it('rejects an UNBALANCED transaction (legs must sum to 0)', async () => {
    await expect(
      ledger.post({
        kind: 'DEPOSIT',
        postings: [
          { accountId: externalId, amountCents: -10000n },
          { accountId: playerId, amountCents: 9999n }, // off by one cent
        ],
      }),
    ).rejects.toThrow(/Unbalanced/);

    // Nothing should have been written.
    expect(await ledger.balanceOf(playerId)).toBe(0n);
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });

  it('requires at least two legs (it is *double* entry)', async () => {
    await expect(
      ledger.post({
        kind: 'DEPOSIT',
        postings: [{ accountId: playerId, amountCents: 0n }],
      }),
    ).rejects.toThrow(/two legs/);
  });

  it('cached balanceCents stays equal to the ledger sum (source of truth)', async () => {
    await ledger.post({
      kind: 'DEPOSIT',
      postings: [
        { accountId: externalId, amountCents: -2500n },
        { accountId: playerId, amountCents: 2500n },
      ],
    });
    await ledger.post({
      kind: 'DEPOSIT',
      postings: [
        { accountId: externalId, amountCents: -500n },
        { accountId: playerId, amountCents: 500n },
      ],
    });

    const cached = await prisma.account.findUniqueOrThrow({ where: { id: playerId } });
    const fromLedger = await ledger.balanceOf(playerId);
    expect(fromLedger).toBe(3000n);
    expect(cached.balanceCents).toBe(fromLedger);
  });

  it('is idempotent: the same referenceId cannot post twice', async () => {
    const ref = 'hand-payout-0001';
    await ledger.post({
      kind: 'TOURNAMENT_PAYOUT',
      referenceId: ref,
      postings: [
        { accountId: externalId, amountCents: -7000n },
        { accountId: playerId, amountCents: 7000n },
      ],
    });

    // Second attempt with the same referenceId must fail (unique constraint).
    await expect(
      ledger.post({
        kind: 'TOURNAMENT_PAYOUT',
        referenceId: ref,
        postings: [
          { accountId: externalId, amountCents: -7000n },
          { accountId: playerId, amountCents: 7000n },
        ],
      }),
    ).rejects.toThrow();

    // Only the first posting took effect.
    expect(await ledger.balanceOf(playerId)).toBe(7000n);
    expect(await prisma.ledgerTransaction.count()).toBe(1);
  });

  it('conserves money: sum of ALL account balances is always zero', async () => {
    // Every cent that enters PLAYER left EXTERNAL — the whole system nets to 0.
    await ledger.post({
      kind: 'DEPOSIT',
      postings: [
        { accountId: externalId, amountCents: -123456n },
        { accountId: playerId, amountCents: 123456n },
      ],
    });

    const agg = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(agg._sum.amountCents).toBe(0n);
  });
});
