import { useState } from 'react';
import { Login } from './components/Login';
import { Players } from './components/Players';
import { Withdrawals } from './components/Withdrawals';

const TOKEN_KEY = 'capa_admin_token';

type Tab = 'withdrawals' | 'players';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [tab, setTab] = useState<Tab>('withdrawals');
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
          <button className={tab === 'withdrawals' ? 'active' : ''} onClick={() => setTab('withdrawals')}>
            Saques
          </button>
          <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>
            Jogadores
          </button>
          <button onClick={logout}>Sair</button>
        </nav>
      </header>
      <main>
        {tab === 'withdrawals' ? (
          <Withdrawals token={token} onForbidden={onForbidden} />
        ) : (
          <Players token={token} onForbidden={onForbidden} />
        )}
      </main>
    </div>
  );
}
