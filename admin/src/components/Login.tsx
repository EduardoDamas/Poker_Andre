import { useState } from 'react';
import { api, ApiError } from '../api';

/// Admin login via phone OTP (same flow as players; non-admins are blocked by
/// the API guard when they try to load admin data).
export function Login({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await api.requestOtp(phone.trim());
      setStep('code');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? 'Muitas tentativas. Aguarde.' : 'Falha ao enviar o código.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.verifyOtp(phone.trim(), code.trim());
      onAuthed(session.accessToken);
    } catch {
      setError('Código inválido ou expirado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1 className="wordmark">
        <span className="red">CAPA</span> CONTEST
      </h1>
      <p className="muted">Painel administrativo</p>

      {step === 'phone' ? (
        <>
          <input
            aria-label="Telefone"
            placeholder="+55 11 99999-8888"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button disabled={busy} onClick={sendCode}>
            Enviar código
          </button>
        </>
      ) : (
        <>
          <input
            aria-label="Código"
            placeholder="Código (6 dígitos)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button disabled={busy} onClick={verify}>
            Entrar
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
