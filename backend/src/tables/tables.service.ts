import { Injectable } from '@nestjs/common';
import { TableService } from '../realtime/table.service';

/**
 * Lobby catalog of joinable Poker rooms (Phase 1).
 *
 * The 7 room levels and their "não assinante" entry fees come from
 * CAPACONTEST.pdf (see docs/PRIZE_RULES.md). Entry fees are in cents.
 * Live seat counts are read from the realtime TableService.
 */

interface RoomDef {
  id: string;
  name: string;
  level: number;
  entryCents: number; // não-assinante entry (V.I.), BRL × 100
}

// Poker is 8 players per table. Entry fees: L1..L7 = 20,40,100,200,1000,2000,10000 BRL.
const POKER_ROOMS: RoomDef[] = [
  { id: 'poker-l1', name: 'Poker — Nível 1', level: 1, entryCents: 2000 },
  { id: 'poker-l2', name: 'Poker — Nível 2', level: 2, entryCents: 4000 },
  { id: 'poker-l3', name: 'Poker — Nível 3', level: 3, entryCents: 10000 },
  { id: 'poker-l4', name: 'Poker — Nível 4', level: 4, entryCents: 20000 },
  { id: 'poker-l5', name: 'Poker — Nível 5', level: 5, entryCents: 100000 },
  { id: 'poker-l6', name: 'Poker — Nível 6', level: 6, entryCents: 200000 },
  { id: 'poker-l7', name: 'Poker — Nível 7', level: 7, entryCents: 1000000 },
];

const MAX_SEATS = 8;

export interface TableInfo {
  id: string;
  name: string;
  level: number;
  entryCents: number;
  maxSeats: number;
  players: number;
}

@Injectable()
export class TablesService {
  constructor(private readonly realtime: TableService) {}

  list(): TableInfo[] {
    return POKER_ROOMS.map((room) => {
      const live = this.realtime.getTable(room.id);
      return {
        id: room.id,
        name: room.name,
        level: room.level,
        entryCents: room.entryCents,
        maxSeats: MAX_SEATS,
        players: live ? this.realtime.seatedCount(live) : 0,
      };
    });
  }
}
