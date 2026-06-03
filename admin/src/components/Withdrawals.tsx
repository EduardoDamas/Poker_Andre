import { useCallback, useEffect, useState } from 'react';
import { api, Withdrawal, ApiError } from '../api';
import { formatBRL } from '../money';

/// Pending manual-Pix withdrawals with approve/reject actions.
export function Withdrawals({ token, onForbidden }: { token: string; onForbidden: () => void }) {
  const [items, setItems] = useState<Withdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api
      .withdrawals(token, 'REQUESTED')
      .then(setItems)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) onForbidden();
        else setError('Falha ao carregar saques.');
      });
  }, [token, onForbidden]);

  useEffect(load, [load]);

  async function act(id: string, kind: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      const note = window.prompt(kind === 'approve' ? 'Observação (pago via Pix):' : 'Motivo da rejeição:') ?? undefined;
      if (kind === 'approve') await api.approve(token, id, note);
      else await api.reject(token, id, note);
      load();
    } catch {
      setError('Não foi possível concluir a ação.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">Carregando…</p>;
  if (items.length === 0) return <p className="muted">Nenhum saque pendente. 🎉</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Valor</th>
          <th>Chave Pix</th>
          <th>Solicitado</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {items.map((w) => (
          <tr key={w.id}>
            <td>{formatBRL(w.amountCents)}</td>
            <td>{w.pixKey}</td>
            <td>{new Date(w.requestedAt).toLocaleString('pt-BR')}</td>
            <td className="actions">
              <button className="approve" disabled={busyId === w.id} onClick={() => act(w.id, 'approve')}>
                Pagar
              </button>
              <button className="reject" disabled={busyId === w.id} onClick={() => act(w.id, 'reject')}>
                Rejeitar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
