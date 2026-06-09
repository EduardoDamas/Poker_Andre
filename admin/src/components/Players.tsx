import { useCallback, useEffect, useState } from 'react';
import { api, Player, ApiError, SubscriptionTier } from '../api';
import { formatBRL } from '../money';

const SUB_LABELS: Record<string, string> = {
  NONE: 'Sem assinatura',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};
const SUB_TIERS: SubscriptionTier[] = ['NONE', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'];

export function Players({ token, onForbidden }: { token: string; onForbidden: () => void }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .players(token)
      .then(setPlayers)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) onForbidden();
        else setError('Falha ao carregar jogadores.');
      });
  }, [token, onForbidden]);

  useEffect(load, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      load();
    } catch {
      setError('Ação falhou.');
    } finally {
      setBusy(null);
    }
  }

  function reject(p: Player) {
    if (!confirm(`Rejeitar a aplicação de ${p.phone}? O número ficará livre para novo cadastro.`)) return;
    run(p.id, () => api.rejectUser(token, p.id));
  }

  function block(p: Player, temporary: boolean) {
    const reason = prompt(`Motivo do bloqueio${temporary ? ' temporário' : ' permanente'}:`, '');
    if (reason === null) return;
    let untilMs: number | undefined;
    if (temporary) {
      const hours = Number(prompt('Bloquear por quantas horas?', '24'));
      if (!hours || hours <= 0) return;
      untilMs = Date.now() + hours * 3600 * 1000;
    }
    run(p.id, () => api.blockUser(token, p.id, reason || '—', untilMs));
  }

  function unblock(p: Player) {
    run(p.id, () => api.unblockUser(token, p.id));
  }

  function changeSubscription(p: Player, sub: SubscriptionTier) {
    if (sub === p.subscription) return;
    let untilMs: number | undefined;
    if (sub !== 'NONE') {
      const days = Number(prompt(`Assinatura ${SUB_LABELS[sub]} válida por quantos dias?`, '30'));
      if (!days || days <= 0) return;
      untilMs = Date.now() + days * 24 * 3600 * 1000;
    }
    run(p.id, () => api.grantSubscription(token, p.id, sub, untilMs));
  }

  if (error) return <p className="error">{error}</p>;
  if (!players) return <p className="muted">Carregando…</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Jogador</th>
          <th>Telefone</th>
          <th>Status</th>
          <th>Assinatura</th>
          <th>Saldo</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id}>
            <td>{p.displayName}{p.role === 'ADMIN' ? ' 🛡' : ''}</td>
            <td>{p.phone}</td>
            <td><StatusBadge p={p} /></td>
            <td>
              {p.role === 'ADMIN' ? (
                <span className="muted">—</span>
              ) : (
                <select
                  value={p.subscription}
                  disabled={busy === p.id}
                  onChange={(e) => changeSubscription(p, e.target.value as SubscriptionTier)}
                >
                  {SUB_TIERS.map((t) => (
                    <option key={t} value={t}>{SUB_LABELS[t]}</option>
                  ))}
                </select>
              )}
            </td>
            <td>{formatBRL(p.balanceCents)}</td>
            <td>
              {p.role === 'ADMIN' ? (
                <span className="muted">—</span>
              ) : p.status === 'PENDING' ? (
                <button className="danger" disabled={busy === p.id} onClick={() => reject(p)}>
                  Rejeitar aplicação
                </button>
              ) : p.blocked ? (
                <button disabled={busy === p.id} onClick={() => unblock(p)}>Desbloquear</button>
              ) : (
                <>
                  <button disabled={busy === p.id} onClick={() => block(p, true)}>Bloquear temp.</button>{' '}
                  <button className="danger" disabled={busy === p.id} onClick={() => block(p, false)}>
                    Bloquear perm.
                  </button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusBadge({ p }: { p: Player }) {
  if (p.blocked) {
    const until = p.blockedUntil ? new Date(p.blockedUntil).toLocaleString('pt-BR') : null;
    return (
      <span title={p.blockReason ?? ''} className="badge badge-danger">
        {until ? `BLOQUEADO até ${until}` : 'BLOQUEADO (perm.)'}
        {p.blockReason ? ` · ${p.blockReason}` : ''}
      </span>
    );
  }
  if (p.status === 'PENDING') return <span className="badge badge-warn">PENDENTE</span>;
  return <span className="badge badge-ok">ATIVO</span>;
}
