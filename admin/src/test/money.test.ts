import { describe, it, expect } from 'vitest';
import { formatBRL } from '../money';

describe('formatBRL', () => {
  it('formats cents as Brazilian currency', () => {
    expect(formatBRL('0')).toBe('R$ 0,00');
    expect(formatBRL('3000')).toBe('R$ 30,00');
    expect(formatBRL(4750)).toBe('R$ 47,50');
  });

  it('groups thousands (plans and prizes run to five figures)', () => {
    expect(formatBRL('150000')).toBe('R$ 1.500,00');
    expect(formatBRL('112500')).toBe('R$ 1.125,00');
    expect(formatBRL('7500000')).toBe('R$ 75.000,00');
  });

  it('survives a missing or malformed amount', () => {
    expect(formatBRL('')).toBe('R$ 0,00');
    expect(formatBRL('abc')).toBe('R$ —');
  });
});
