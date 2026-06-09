import { useCallback, useEffect, useState } from 'react';
import { api, Deposit, ApiError } from '../api';
import { formatBRL } from '../money';

/// Pending manual-Pix deposits with confirm/reject actions.
/// Confirming credits the player's wallet (EXTERNAL → PLAYER).
export function Deposits({ token, onForbidden }: { token: string; onForbidden: () => void }) {
  const [items, setItems] = useState<Deposit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api
      .deposits(token, 'REQUESTED')
      .then(setItems)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) onForbidden();
        else setError('Falha ao carregar depósitos.');
      });
  }, [token, onForbidden]);

  useEffect(load, [load]);

  async function act(id: string, kind: 'confirm' | 'reject') {
    setBusyId(id);
    setError(null);
    try {
      const note =
        window.prompt(
          kind === 'confirm' ? 'Observação (Pix recebido):' : 'Motivo da rejeição:',
        ) ?? undefined;
      if (kind === 'confirm') await api.confirmDeposit(token, id, note);
      else await api.rejectDeposit(token, id, note);
      load();
    } catch {
      setError('Não foi possível concluir a ação.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">Carregando…</p>;
  if (items.length === 0) return <p className="muted">Nenhum depósito pendente. 🎉</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>Valor</th>
          <th>Referência Pix</th>
          <th>Solicitado</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        {items.map((d) => (
          <tr key={d.id}>
            <td>{formatBRL(d.amountCents)}</td>
            <td>{d.pixReference ?? '—'}</td>
            <td>{new Date(d.requestedAt).toLocaleString('pt-BR')}</td>
            <td className="actions">
              <button className="approve" disabled={busyId === d.id} onClick={() => act(d.id, 'confirm')}>
                Confirmar
              </button>
              <button className="reject" disabled={busyId === d.id} onClick={() => act(d.id, 'reject')}>
                Rejeitar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
