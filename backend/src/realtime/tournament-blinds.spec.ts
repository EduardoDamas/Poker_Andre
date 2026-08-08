import { tournamentBlinds } from './table.service';

/**
 * Client spec: at the game tables the minimum bet (big blind) starts at 50
 * chips and doubles automatically every 3 rounds; the small blind is half.
 */
describe('tournamentBlinds schedule', () => {
  it('opens at 50/25 on the first hand', () => {
    expect(tournamentBlinds(0)).toEqual({ smallBlind: 25, bigBlind: 50 });
  });

  it('holds the level for 3 rounds, then doubles', () => {
    // Hands 1–3 (0-based 0,1,2) → BB 50.
    expect(tournamentBlinds(0).bigBlind).toBe(50);
    expect(tournamentBlinds(1).bigBlind).toBe(50);
    expect(tournamentBlinds(2).bigBlind).toBe(50);
    // Hands 4–6 → BB 100.
    expect(tournamentBlinds(3).bigBlind).toBe(100);
    expect(tournamentBlinds(4).bigBlind).toBe(100);
    expect(tournamentBlinds(5).bigBlind).toBe(100);
    // Hands 7–9 → BB 200.
    expect(tournamentBlinds(6).bigBlind).toBe(200);
    expect(tournamentBlinds(8).bigBlind).toBe(200);
  });

  it('doubles every 3 rounds without bound', () => {
    expect(tournamentBlinds(9).bigBlind).toBe(400);
    expect(tournamentBlinds(12).bigBlind).toBe(800);
    expect(tournamentBlinds(15).bigBlind).toBe(1600);
  });

  it('keeps the small blind at half the big blind', () => {
    for (const hands of [0, 3, 6, 9, 12, 15]) {
      const { smallBlind, bigBlind } = tournamentBlinds(hands);
      expect(smallBlind).toBe(bigBlind / 2);
    }
  });
});
