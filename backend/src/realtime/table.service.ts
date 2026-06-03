import { Injectable } from '@nestjs/common';
import { Card } from '../poker/deck';
import { Action, ActionType } from '../poker/betting-round';
import { PokerHand } from '../poker/hand';
import { SettlementService } from '../wallet/settlement.service';

/**
 * In-memory table state + live hand orchestration for the realtime layer.
 *
 * PRIVACY: hole cards live only inside the server-side PokerHand. The public
 * table/game state never contains them; they go to each owner's socket directly.
 *
 * Money: a hand is played in chips (fixed BUY_IN). Wallets are only touched at
 * showdown, when SettlementService books the result as one double-entry txn.
 * (Funds are verified at settlement; a future hardening step verifies at seat.)
 *
 * State is in-process for now; Step D4 moves live state into Redis for scale.
 */

const BUY_IN = 100; // chips == cents for Phase 1
const SMALL_BLIND = 1;
const BIG_BLIND = 2;

interface SeatSlot {
  userId: string;
  socketId: string;
}

interface Table {
  id: string;
  maxSeats: number;
  seats: (SeatSlot | null)[];
  handInProgress: boolean;
  hand: PokerHand | null;
  buyIns: Record<string, bigint>;
  handCount: number;
}

export interface PublicSeat {
  position: number;
  userId: string;
  hasCards: boolean;
}

export interface PublicTableState {
  id: string;
  maxSeats: number;
  handInProgress: boolean;
  seats: (PublicSeat | null)[];
}

export interface GameState {
  tableId: string;
  street: string;
  board: Card[];
  actingPlayerId: string | null;
  legalActions: ActionType[];
}

export interface HandResultPayload {
  board: Card[];
  pots: { amount: number; winnerIds: string[] }[];
  payouts: Record<string, number>;
  finalStacks: Record<string, number>;
}

@Injectable()
export class TableService {
  private readonly tables = new Map<string, Table>();

  constructor(private readonly settlement: SettlementService) {}

  getTable(id: string): Table | undefined {
    return this.tables.get(id);
  }

  private getOrCreate(id: string, maxSeats = 8): Table {
    let table = this.tables.get(id);
    if (!table) {
      const seats = Math.min(Math.max(maxSeats, 2), 8);
      table = {
        id,
        maxSeats: seats,
        seats: new Array(seats).fill(null),
        handInProgress: false,
        hand: null,
        buyIns: {},
        handCount: 0,
      };
      this.tables.set(id, table);
    }
    return table;
  }

  join(id: string, userId: string, socketId: string, maxSeats?: number): { table: Table; position: number } {
    const table = this.getOrCreate(id, maxSeats);
    if (table.seats.some((s) => s?.userId === userId)) {
      throw new Error('Already seated at this table.');
    }
    const position = table.seats.findIndex((s) => s === null);
    if (position === -1) throw new Error('Table is full.');
    table.seats[position] = { userId, socketId };
    return { table, position };
  }

  /**
   * Re-associate a reconnecting player's seat with a new socket. The hand is
   * never abandoned on disconnect, so the player resumes exactly where they were.
   */
  reconnect(id: string, userId: string, socketId: string): { table: Table; position: number } {
    const table = this.tables.get(id);
    if (!table) throw new Error('Table not found.');
    const position = table.seats.findIndex((s) => s?.userId === userId);
    if (position === -1) throw new Error('Not seated at this table.');
    table.seats[position]!.socketId = socketId;
    return { table, position };
  }

  leave(id: string, userId: string): Table | null {
    const table = this.tables.get(id);
    if (!table) return null;
    const idx = table.seats.findIndex((s) => s?.userId === userId);
    if (idx !== -1) table.seats[idx] = null;
    // Leaving mid-hand abandons it (no settlement; chips were never escrowed).
    if (this.seatedSlots(table).length < 2) {
      table.hand = null;
      table.handInProgress = false;
    }
    return table;
  }

  seatedCount(table: Table): number {
    return this.seatedSlots(table).length;
  }

  /** Start a new hand if ≥2 are seated and none is in progress. */
  startHand(table: Table): boolean {
    const seated = this.seatedSlots(table);
    if (table.handInProgress || seated.length < 2) return false;

    table.buyIns = {};
    for (const s of seated) table.buyIns[s.userId] = BigInt(BUY_IN);
    table.hand = new PokerHand(
      seated.map((s) => ({ id: s.userId, stack: BUY_IN })),
      { smallBlind: SMALL_BLIND, bigBlind: BIG_BLIND },
    );
    table.handInProgress = true;
    return true;
  }

  seatedPlayers(table: Table): SeatSlot[] {
    return this.seatedSlots(table);
  }

  holeFor(table: Table, userId: string): [Card, Card] | undefined {
    return table.handInProgress ? table.hand?.holeCardsOf(userId) : undefined;
  }

  publicState(table: Table): PublicTableState {
    return {
      id: table.id,
      maxSeats: table.maxSeats,
      handInProgress: table.handInProgress,
      seats: table.seats.map((s, position) =>
        s ? { position, userId: s.userId, hasCards: table.handInProgress } : null,
      ),
    };
  }

  gameState(table: Table): GameState | null {
    if (!table.hand) return null;
    return {
      tableId: table.id,
      street: table.hand.currentStreet,
      board: table.hand.board,
      actingPlayerId: table.hand.actingPlayerId,
      legalActions: table.hand.legalActions(),
    };
  }

  /**
   * Apply a player's action. When the hand completes, settle it into the ledger
   * and return the result payload.
   */
  async act(
    tableId: string,
    userId: string,
    action: Action,
  ): Promise<{ complete: false } | { complete: true; result: HandResultPayload }> {
    const table = this.tables.get(tableId);
    if (!table?.hand) throw new Error('No hand in progress at this table.');

    table.hand.act(userId, action);

    if (!table.hand.isComplete()) return { complete: false };

    const out = table.hand.result();
    await this.settle(table, out.finalStacks);

    const payload: HandResultPayload = {
      board: out.board,
      pots: out.pots.map((p) => ({ amount: p.amount, winnerIds: p.winnerIds })),
      payouts: out.payouts,
      finalStacks: out.finalStacks,
    };
    table.hand = null;
    table.handInProgress = false;
    return { complete: true, result: payload };
  }

  private async settle(table: Table, finalStacks: Record<string, number>): Promise<void> {
    const seats = Object.entries(table.buyIns).map(([userId, buyInCents]) => ({
      userId,
      buyInCents,
      finalStackCents: BigInt(finalStacks[userId] ?? 0),
    }));
    table.handCount += 1;
    await this.settlement.settleHand({ handId: `${table.id}#${table.handCount}`, seats });
  }

  private seatedSlots(table: Table): SeatSlot[] {
    return table.seats.filter((s): s is SeatSlot => s !== null);
  }
}
