import { useState } from 'react';
import { api, ApiError } from '../api';

export function Login({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    setError(null);
    try {
      const { accessToken } = await api.adminLogin(username.trim(), password);
      onAuthed(accessToken);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Usuário ou senha incorretos.'
          : 'Erro ao conectar. Tente novamente.',
      );
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
      <input
        aria-label="Usuário"
        placeholder="Usuário"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && login()}
      />
      <input
        aria-label="Senha"
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && login()}
      />
      <button disabled={busy} onClick={login}>
        {busy ? 'Entrando…' : 'Entrar'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
