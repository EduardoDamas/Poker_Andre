import { Injectable } from '@nestjs/common';
import { Card } from '../poker/deck';
import { dealHand } from '../poker/dealer';

/**
 * In-memory table & seating state for the realtime layer.
 *
 * PRIVACY: hole cards live only here on the server. The public table state
 * (broadcast to the room) never contains them — only a `hasCards` flag. Hole
 * cards are delivered to their owner's socket directly (see GameGateway).
 *
 * (State is in-process for now; Step D4 moves live state into Redis for scale.)
 */

interface SeatSlot {
  userId: string;
  socketId: string;
  hole?: [Card, Card];
}

interface Table {
  id: string;
  maxSeats: number;
  seats: (SeatSlot | null)[];
  handInProgress: boolean;
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

export interface SeatedPlayer {
  userId: string;
  socketId: string;
  hole?: [Card, Card];
}

@Injectable()
export class TableService {
  private readonly tables = new Map<string, Table>();

  private getOrCreate(id: string, maxSeats = 8): Table {
    let table = this.tables.get(id);
    if (!table) {
      const seats = Math.min(Math.max(maxSeats, 2), 8);
      table = { id, maxSeats: seats, seats: new Array(seats).fill(null), handInProgress: false };
      this.tables.set(id, table);
    }
    return table;
  }

  /** Seat a user at the next free position. Throws on conflicts. */
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

  /** Remove a user from a table (no-op if not seated). */
  leave(id: string, userId: string): Table | null {
    const table = this.tables.get(id);
    if (!table) return null;
    const idx = table.seats.findIndex((s) => s?.userId === userId);
    if (idx !== -1) table.seats[idx] = null;
    if (this.seatedPlayers(table).length < 2) table.handInProgress = false;
    return table;
  }

  /**
   * Deal a new hand if ≥2 are seated and none is in progress. Stores each
   * player's hole cards privately. Returns true if a hand was started.
   */
  startHandIfReady(table: Table): boolean {
    const seated = this.orderedSeats(table);
    if (table.handInProgress || seated.length < 2) return false;

    const dealt = dealHand(seated.length);
    seated.forEach((slot, i) => (slot.hole = dealt.holeCards[i]));
    table.handInProgress = true;
    return true;
  }

  seatedPlayers(table: Table): SeatedPlayer[] {
    return this.orderedSeats(table).map((s) => ({ userId: s.userId, socketId: s.socketId, hole: s.hole }));
  }

  publicState(table: Table): PublicTableState {
    return {
      id: table.id,
      maxSeats: table.maxSeats,
      handInProgress: table.handInProgress,
      seats: table.seats.map((s, position) =>
        s ? { position, userId: s.userId, hasCards: !!s.hole } : null,
      ),
    };
  }

  private orderedSeats(table: Table): SeatSlot[] {
    return table.seats.filter((s): s is SeatSlot => s !== null);
  }
}
