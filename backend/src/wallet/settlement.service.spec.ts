import { PrismaClient } from '@prisma/client';
import { LedgerService } from './ledger.service';
import { WalletService } from './wallet.service';
import { SettlementService } from './settlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { resetDb } from '../test-utils/reset-db';
import { PokerHand } from '../poker/hand';
import { Card, ShuffledDeck, hashSeed } from '../poker/deck';

/**
 * STEP C6 gate — settle a finished poker hand into the money ledger.
 * Bridges the chips engine (Milestone C) to the double-entry ledger (Milestone A).
 */
function makeDeck(cards: string[]): ShuffledDeck {
  const seed = 'b'.repeat(64);
  const padded = [...cards];
  while (padded.length < 52) padded.push('2c');
  return { cards: padded as Card[], seedHash: hashSeed(seed), seed };
}

describe('SettlementService', () => {
  let prisma: PrismaClient;
  let wallet: WalletService;
  let ledger: LedgerService;
  let settlement: SettlementService;
  let counter = 0;

  beforeAll(() => {
    prisma = new PrismaClient();
    ledger = new LedgerService(prisma as unknown as PrismaService);
    wallet = new WalletService(prisma as unknown as PrismaService, ledger);
    settlement = new SettlementService(prisma as unknown as PrismaService, ledger, wallet);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  // Create a funded user; returns its id. Deposits `cents` into the wallet.
  async function fundedUser(cents: bigint): Promise<string> {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511933300${counter.toString().padStart(3, '0')}`,
        displayName: `P${counter}`,
        cpf: `3000000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    await wallet.deposit(user.id, cents);
    return user.id;
  }

  async function balanceOf(userId: string): Promise<bigint> {
    const acc = await prisma.account.findUnique({ where: { userId } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  async function systemBalance(type: string): Promise<bigint> {
    const acc = await prisma.account.findFirst({ where: { type: type as never } });
    return acc ? ledger.balanceOf(acc.id) : 0n;
  }

  it('settles a real engine hand: wallets reflect the result, escrow returns to zero', async () => {
    const p0 = await fundedUser(100n);
    const p1 = await fundedUser(100n);

    // Heads-up AA vs KK — p0 wins (mirrors the C5 scenario).
    const deck = makeDeck([
      'As', 'Ah', 'Kd', 'Kc', '2d', '2c', '7d', '9s', '3h', 'Jh', '5c', '4s',
    ]);
    const hand = new PokerHand(
      [{ id: p0, stack: 100 }, { id: p1, stack: 100 }],
      { smallBlind: 1, bigBlind: 2, deck },
    );
    while (!hand.isComplete()) {
      const id = hand.actingPlayerId!;
      hand.act(id, { type: hand.legalActions().includes('check') ? 'check' : 'call' });
    }
    const out = hand.result();

    await settlement.settleHand({
      handId: 'h1',
      seats: [
        { userId: p0, buyInCents: 100n, finalStackCents: BigInt(out.finalStacks[p0]) },
        { userId: p1, buyInCents: 100n, finalStackCents: BigInt(out.finalStacks[p1]) },
      ],
    });

    // Wallets match the game result.
    expect(await balanceOf(p0)).toBe(102n);
    expect(await balanceOf(p1)).toBe(98n);
    // Escrow emptied; no rake taken.
    expect(await systemBalance('PRIZE_POOL')).toBe(0n);
    expect(await systemBalance('HOUSE_RAKE')).toBe(0n);

    // Whole-system conservation.
    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0n);
  });

  it('takes rake to the house and still conserves money', async () => {
    const p0 = await fundedUser(100n);
    const p1 = await fundedUser(100n);

    // Constructed result: p0 wins, house rakes 5. Σ buy-ins (200) == Σ final (195) + rake (5).
    await settlement.settleHand({
      handId: 'h-rake',
      rakeCents: 5n,
      seats: [
        { userId: p0, buyInCents: 100n, finalStackCents: 195n },
        { userId: p1, buyInCents: 100n, finalStackCents: 0n },
      ],
    });

    expect(await balanceOf(p0)).toBe(195n);
    expect(await balanceOf(p1)).toBe(0n);
    expect(await systemBalance('HOUSE_RAKE')).toBe(5n);
    expect(await systemBalance('PRIZE_POOL')).toBe(0n);

    const all = await prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } });
    expect(all._sum.amountCents).toBe(0n);
  });

  it('rejects a settlement that does not balance', async () => {
    const p0 = await fundedUser(100n);
    const p1 = await fundedUser(100n);
    await expect(
      settlement.settleHand({
        handId: 'bad',
        seats: [
          { userId: p0, buyInCents: 100n, finalStackCents: 150n }, // 200 != 250
          { userId: p1, buyInCents: 100n, finalStackCents: 100n },
        ],
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it('rejects buying in for more than the wallet holds', async () => {
    const p0 = await fundedUser(50n); // only 50
    const p1 = await fundedUser(100n);
    await expect(
      settlement.settleHand({
        handId: 'poor',
        seats: [
          { userId: p0, buyInCents: 100n, finalStackCents: 100n },
          { userId: p1, buyInCents: 100n, finalStackCents: 100n },
        ],
      }),
    ).rejects.toThrow(/Insufficient/);
  });

  it('is idempotent: the same hand cannot settle twice', async () => {
    const p0 = await fundedUser(100n);
    const p1 = await fundedUser(100n);
    const seats = [
      { userId: p0, buyInCents: 100n, finalStackCents: 120n },
      { userId: p1, buyInCents: 100n, finalStackCents: 80n },
    ];
    await settlement.settleHand({ handId: 'dup', seats });
    await expect(settlement.settleHand({ handId: 'dup', seats })).rejects.toThrow();
    // Only one settlement took effect.
    expect(await balanceOf(p0)).toBe(120n);
  });
});
