import { isBlocked } from './user-status';

describe('isBlocked', () => {
  const now = new Date('2026-06-04T12:00:00Z');
  const u = (status: string, until: Date | null) =>
    ({ status, blockedUntil: until }) as Parameters<typeof isBlocked>[0];

  it('ACTIVE is not blocked', () => {
    expect(isBlocked(u('ACTIVE', null), now)).toBe(false);
  });
  it('permanent block (BLOCKED, no expiry) is blocked', () => {
    expect(isBlocked(u('BLOCKED', null), now)).toBe(true);
  });
  it('temporary block still in the future is blocked', () => {
    expect(isBlocked(u('BLOCKED', new Date('2026-06-04T13:00:00Z')), now)).toBe(true);
  });
  it('expired temporary block is NOT blocked (auto-unblock)', () => {
    expect(isBlocked(u('BLOCKED', new Date('2026-06-04T11:00:00Z')), now)).toBe(false);
  });
});
