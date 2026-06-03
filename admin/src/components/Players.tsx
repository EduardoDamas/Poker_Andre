import { useEffect, useState } from 'react';
import { api, Player, ApiError } from '../api';
import { formatBRL } from '../money';

export function Players({ token, onForbidden }: { token: string; onForbidden: () => void }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .players(token)
      .then(setPlayers)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) onForbidden();
        else setError('Falha ao carregar jogadores.');
      });
  }, [token, onForbidden]);

  if (error) return <p className="error">{error}</p>;
  if (!players) return <p className="muted">Carregando…</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Jogador</th>
          <th>Telefone</th>
          <th>Status</th>
          <th>Papel</th>
          <th>Saldo</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id}>
            <td>{p.displayName}</td>
            <td>{p.phone}</td>
            <td>{p.status}</td>
            <td>{p.role}</td>
            <td>{formatBRL(p.balanceCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
