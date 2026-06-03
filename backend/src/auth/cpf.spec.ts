import { isValidCpf, normalizeCpf, formatCpf } from './cpf';

/**
 * STEP B1 gate — CPF validation.
 * The two valid CPFs below are well-known check-digit-correct test values.
 */
describe('CPF validation', () => {
  const VALID = ['111.444.777-35', '529.982.247-25'];
  const VALID_RAW = ['11144477735', '52998224725'];

  it('accepts valid CPFs (formatted and raw)', () => {
    for (const cpf of [...VALID, ...VALID_RAW]) {
      expect(isValidCpf(cpf)).toBe(true);
    }
  });

  it('rejects CPFs with a wrong check digit', () => {
    expect(isValidCpf('111.444.777-30')).toBe(false); // last digit wrong
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('11144477736')).toBe(false);
  });

  it('rejects repeated-digit sequences (mathematically valid but illegal)', () => {
    for (let d = 0; d <= 9; d++) {
      expect(isValidCpf(String(d).repeat(11))).toBe(false);
    }
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('111444777350')).toBe(false); // 12 digits
    expect(isValidCpf('')).toBe(false);
  });

  it('rejects non-numeric / garbage input', () => {
    expect(isValidCpf('abc.def.ghi-jk')).toBe(false);
    expect(isValidCpf('CPF inválido')).toBe(false);
    // @ts-expect-error guarding runtime misuse
    expect(isValidCpf(null)).toBe(false);
  });

  it('normalizeCpf strips formatting', () => {
    expect(normalizeCpf('111.444.777-35')).toBe('11144477735');
    expect(normalizeCpf(' 111 444 777 35 ')).toBe('11144477735');
  });

  it('formatCpf renders the standard mask', () => {
    expect(formatCpf('11144477735')).toBe('111.444.777-35');
    expect(formatCpf('123')).toBe('123'); // not 11 digits → unchanged
  });
});
