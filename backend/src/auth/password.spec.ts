import { hashPassword, verifyPassword } from './password';

describe('password (scrypt)', () => {
  it('verifies a correct password', () => {
    const stored = hashPassword('s3nh4-teste');
    expect(verifyPassword('s3nh4-teste', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('s3nh4-teste');
    expect(verifyPassword('errada', stored)).toBe(false);
  });

  it('uses a random salt (same password → different stored value)', () => {
    expect(hashPassword('abc123')).not.toBe(hashPassword('abc123'));
  });

  it('rejects a malformed stored value', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false);
  });
});
