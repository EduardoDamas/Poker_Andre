import { PromoBracket, PromoBracketConfig } from './promo-bracket';
import { Subscription } from '../tournament/subscription';

/**
 * The promotion bracket's rules, without sockets (client, 2026-09-22): the
 * start waits for the minimum, places are capped, only players present hold a
 * place, tables play down to one winner each and the winners meet at a final.
 */
describe('PromoBracket', () => {
  const START = Date.parse('2026-10-07T20:00:00Z');
  const MIN = 60_000;

  const bracket = (over: Partial<PromoBracketConfig> = {}) =>
    new PromoBracket({
      eventId: 'e1',
      roomId: 'promo-e1',
      startsAt: new Date(START),
      minPlayers: 80,
      maxPlayers: 100,
      waitMinutes: 30,
      ...over,
    });

  const fill = (b: PromoBracket, n: number, from = 0) => {
    for (let i = from; i < from + n; i++) b.register(`p${i}`, `s${i}`, 'NONE');
  };

  const noSubs = new Map<string, Subscription>();

  /** Play every current table to its first-listed player; returns the outcome of the last. */
  const playRound = (b: PromoBracket, tables: { id: string; players: string[] }[]) => {
    let out;
    for (const t of tables) out = b.tableWon(t.id, t.players[0]);
    return out!;
  };

  describe('when it starts', () => {
    it('not before its time, even when full', () => {
      const b = bracket();
      fill(b, 100);
      expect(b.shouldStart(START - 1)).toBe(false);
      expect(b.shouldStart(START)).toBe(true);
    });

    it('waits below the minimum, then starts with whoever is there after the tolerance', () => {
      const b = bracket();
      fill(b, 50);
      expect(b.shouldStart(START)).toBe(false);
      expect(b.shouldStart(START + 29 * MIN)).toBe(false);
      expect(b.shouldStart(START + 30 * MIN)).toBe(true);
    });

    it('with no tolerance, waits for the minimum however long', () => {
      const b = bracket({ waitMinutes: null });
      fill(b, 79);
      expect(b.shouldStart(START + 170 * MIN)).toBe(false);
      fill(b, 1, 79);
      expect(b.shouldStart(START + 170 * MIN)).toBe(true);
    });

    it('never with a single player', () => {
      const b = bracket({ waitMinutes: 0 });
      fill(b, 1);
      expect(b.shouldStart(START + 60 * MIN)).toBe(false);
    });

    it('knows the moments the clock alone can start it', () => {
      expect(bracket().startChecks(START - 10 * MIN)).toEqual([START, START + 30 * MIN]);
      expect(bracket().startChecks(START + 10 * MIN)).toEqual([START + 30 * MIN]);
      expect(bracket({ waitMinutes: null }).startChecks(START - MIN)).toEqual([START]);
    });
  });

  describe('places', () => {
    it('are capped', () => {
      const b = bracket();
      fill(b, 100);
      expect(() => b.register('late', 'sx', 'NONE')).toThrow(/vagas/);
    });

    it('are held only while the app is open: a dropped connection frees one', () => {
      const b = bracket();
      fill(b, 100);
      expect(b.dropSocket('s7')).toEqual(['p7']);
      expect(b.registered).toBe(99);
      expect(b.register('late', 'sx', 'NONE')).toBe('joined');
    });

    it('a returning player re-binds instead of taking a second place', () => {
      const b = bracket();
      fill(b, 3);
      expect(b.register('p1', 'new-socket', 'MONTHLY')).toBe('rejoined');
      expect(b.registered).toBe(3);
      expect(b.entrant('p1')?.socketId).toBe('new-socket');
    });

    it('can be given back before the start, not after', () => {
      const b = bracket({ minPlayers: 2 });
      fill(b, 3);
      expect(b.leave('p0')).toBe(true);
      b.start(noSubs);
      expect(b.leave('p1')).toBe(false);
    });

    it('nobody new joins once it runs', () => {
      const b = bracket({ minPlayers: 2 });
      fill(b, 4);
      b.start(noSubs);
      expect(() => b.register('late', 'sx', 'NONE')).toThrow(/já começou/);
    });

    it('after the start a dropped connection only marks the player away', () => {
      const b = bracket({ minPlayers: 2 });
      fill(b, 4);
      b.start(noSubs);
      b.dropSocket('s2');
      expect(b.entrant('p2')?.connected).toBe(false);
      expect(b.isAlive('p2')).toBe(true);
      b.rebind('p2', 's2b');
      expect(b.entrant('p2')).toMatchObject({ connected: true, socketId: 's2b' });
    });
  });

  describe('the bracket', () => {
    it('80 players: 10 tables of 8, then a final table of the 10 winners, then a champion', () => {
      const b = bracket();
      fill(b, 80);
      const first = b.start(noSubs);
      expect(first).toHaveLength(10);
      expect(first.every((t) => t.players.length === 8)).toBe(true);
      expect(b.isFinal(first[0].id)).toBe(false);

      // Nine tables finish: their winners wait for the tenth.
      for (const t of first.slice(0, 9)) b.tableWon(t.id, t.players[0]);
      expect(b.waitingWinners()).toHaveLength(9);
      expect(b.tablesLeft()).toBe(1);

      const last = first[9];
      const out = b.tableWon(last.id, last.players[0]);
      expect(out.nextRound).toHaveLength(1);
      const final = out.nextRound![0];
      expect(final.players).toHaveLength(10);
      expect(b.isFinal(final.id)).toBe(true);
      expect(b.aliveCount).toBe(10);

      b.tableWon(final.id, final.players[3]);
      expect(b.champion).toBe(final.players[3]);
      expect(b.finished).toBe(true);
    });

    it('100 players still meet at a final table of 10', () => {
      const b = bracket();
      fill(b, 100);
      const first = b.start(noSubs);
      expect(first).toHaveLength(10);
      expect(playRound(b, first).nextRound![0].players).toHaveLength(10);
    });

    it('a small field is already the final table', () => {
      const b = bracket({ minPlayers: 2 });
      fill(b, 7);
      const [only] = b.start(noSubs);
      expect(only.players).toHaveLength(7);
      expect(b.isFinal(only.id)).toBe(true);
    });

    it('seats everyone who holds a place, exactly once', () => {
      const b = bracket();
      fill(b, 93);
      const seated = b.start(noSubs).flatMap((t) => t.players);
      expect(new Set(seated).size).toBe(93);
    });

    it('routes each player to their table, and nobody once they are out', () => {
      const b = bracket({ minPlayers: 2 });
      fill(b, 16);
      const first = b.start(noSubs);
      const t = first[0];
      expect(b.tableOf(t.players[1])).toBe(t.id);
      b.tableWon(t.id, t.players[0]);
      expect(b.tableOf(t.players[1])).toBeUndefined();
      expect(b.isAlive(t.players[1])).toBe(false);
    });

    it('places: players knocked out together share their place', () => {
      const b = bracket({ minPlayers: 2 });
      fill(b, 16);
      b.start(noSubs);
      expect(b.knockOut(['p0'])).toBe(16);
      expect(b.knockOut(['p1', 'p2'])).toBe(14);
    });
  });

  describe('the subscriber prize', () => {
    it('follows the plan read at the start, not at registration', () => {
      const b = bracket({ minPlayers: 2 });
      fill(b, 3); // all registered as non-subscribers
      b.start(new Map<string, Subscription>([['p0', 'MONTHLY'], ['p1', 'NONE'], ['p2', 'NONE']]));
      expect(b.subscribedAtStart('p0')).toBe(true); // subscribed while waiting
      expect(b.subscribedAtStart('p1')).toBe(false);
    });
  });
});
