import { isAdult, ageInYears } from './age';

/**
 * STEP B2 gate — 18+ check. `now` is fixed so tests are deterministic.
 */
describe('age / 18+ check', () => {
  const NOW = new Date('2026-06-03T12:00:00Z');
  const D = (s: string) => new Date(`${s}T00:00:00Z`);

  it('allows someone who turns 18 exactly today', () => {
    expect(isAdult(D('2008-06-03'), NOW)).toBe(true);
  });

  it('blocks someone who turns 18 tomorrow (one day short)', () => {
    expect(isAdult(D('2008-06-04'), NOW)).toBe(false);
  });

  it('allows someone clearly over 18', () => {
    expect(isAdult(D('1990-01-01'), NOW)).toBe(true);
  });

  it('blocks someone clearly under 18', () => {
    expect(isAdult(D('2015-01-01'), NOW)).toBe(false);
  });

  it('handles the day before / after a birthday correctly', () => {
    expect(isAdult(D('2008-06-02'), NOW)).toBe(true); // already turned 18 yesterday
    expect(isAdult(D('2008-06-03'), NOW)).toBe(true); // turns 18 today
    expect(isAdult(D('2008-06-04'), NOW)).toBe(false); // turns 18 tomorrow
  });

  it('rejects a future birth date', () => {
    expect(isAdult(D('2030-01-01'), NOW)).toBe(false);
  });

  it('rejects an invalid date', () => {
    expect(isAdult(new Date('not-a-date'), NOW)).toBe(false);
  });

  it('respects a custom minimum age', () => {
    expect(isAdult(D('2005-06-03'), NOW, 21)).toBe(true); // exactly 21 today
    expect(isAdult(D('2005-06-04'), NOW, 21)).toBe(false); // 21 tomorrow
  });

  it('ageInYears computes completed years', () => {
    expect(ageInYears(D('1990-06-03'), NOW)).toBe(36);
    expect(ageInYears(D('1990-06-04'), NOW)).toBe(35); // birthday not yet reached
  });
});
