import { useEffect, useState } from 'react';
import { api } from './api';
import { Login } from './components/Login';
import { Players } from './components/Players';
import { Withdrawals } from './components/Withdrawals';
import { Deposits } from './components/Deposits';
import { OtpRequests } from './components/OtpRequests';

const TOKEN_KEY = 'capa_admin_token';

// Auto-login so the panel opens without a login screen. No secret is baked into
// the build: the password is empty unless supplied at build time via
// VITE_ADMIN_PASS. An empty password works only when the backend runs in open
// mode (ADMIN_OPEN=1). Otherwise auto-login fails and the form is shown.
const env = (import.meta as { env?: Record<string, string> }).env ?? {};
const AUTO_USER = env.VITE_ADMIN_USER ?? 'admin';
const AUTO_PASS = env.VITE_ADMIN_PASS ?? '';

type Tab = 'deposits' | 'withdrawals' | 'players' | 'otp';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [tab, setTab] = useState<Tab>('deposits');
  const [forbidden, setForbidden] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);

  function authed(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
    setForbidden(false);
    setToken(t);
  }
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  // On load, log in automatically with the built-in credentials — no form.
  useEffect(() => {
    if (token) return;
    let cancelled = false;
    api
      .adminLogin(AUTO_USER, AUTO_PASS)
      .then((s) => { if (!cancelled) authed(s.accessToken); })
      .catch(() => { if (!cancelled) setAutoFailed(true); });
    return () => { cancelled = true; };
  }, [token]);

  if (!token) {
    // Auto-login in progress → spinner; if it failed, fall back to the form.
    if (!autoFailed) {
      return (
        <div className="login">
          <h1 className="wordmark"><span className="red">CAPA</span> CONTEST</h1>
          <p className="muted">Entrando…</p>
        </div>
      );
    }
    return <Login onAuthed={authed} />;
  }

  if (forbidden) {
    return (
      <div className="login">
        <p className="error">Esta conta não é administradora.</p>
        <button onClick={logout}>Sair</button>
      </div>
    );
  }

  const onForbidden = () => setForbidden(true);

  return (
    <div className="app">
      <header>
        <span className="brand">
          <span className="red">CAPA</span> CONTEST · Admin
        </span>
        <nav>
          <button className={tab === 'deposits' ? 'active' : ''} onClick={() => setTab('deposits')}>
            Depósitos
          </button>
          <button className={tab === 'withdrawals' ? 'active' : ''} onClick={() => setTab('withdrawals')}>
            Saques
          </button>
          <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>
            Jogadores
          </button>
          <button className={tab === 'otp' ? 'active' : ''} onClick={() => setTab('otp')}>
            Códigos OTP
          </button>
          <button onClick={logout}>Sair</button>
        </nav>
      </header>
      <main>
        {tab === 'deposits' ? (
          <Deposits token={token} onForbidden={onForbidden} />
        ) : tab === 'withdrawals' ? (
          <Withdrawals token={token} onForbidden={onForbidden} />
        ) : tab === 'players' ? (
          <Players token={token} onForbidden={onForbidden} />
        ) : (
          <OtpRequests token={token} />
        )}
      </main>
    </div>
  );
}
