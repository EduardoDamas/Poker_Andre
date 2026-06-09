import { useState } from 'react';
import { Login } from './components/Login';
import { Players } from './components/Players';
import { Withdrawals } from './components/Withdrawals';
import { Deposits } from './components/Deposits';
import { OtpRequests } from './components/OtpRequests';

const TOKEN_KEY = 'capa_admin_token';

type Tab = 'deposits' | 'withdrawals' | 'players' | 'otp';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [tab, setTab] = useState<Tab>('deposits');
  const [forbidden, setForbidden] = useState(false);

  function authed(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
    setForbidden(false);
    setToken(t);
  }
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  if (!token) return <Login onAuthed={authed} />;

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
