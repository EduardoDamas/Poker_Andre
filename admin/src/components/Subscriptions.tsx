import { useCallback, useEffect, useState } from 'react';
import { api, SubscriptionRequest, ApiError } from '../api';
import { formatBRL } from '../money';

const PLAN_LABELS: Record<string, string> = {
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

/// Players who asked to subscribe and paid through the merchant's InfinitePay
/// link. The links are the same for everyone, so the payment can't be matched
/// automatically — confirm here after checking it arrived in InfinitePay.
/// Confirming grants the plan (Mensal 30 · Trimestral 90 · Semestral 180 · Anual 365 dias).
export function Subscriptions({ token, onForbidden }: { token: string; onForbidden: () => void }) {
  const [items, setItems] = useState<SubscriptionRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .subscriptionRequests(token)
      .then(setItems)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) onForbidden();
        else setError('Falha ao carregar assinaturas.');
      });
  }, [token, onForbidden]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function act(r: SubscriptionRequest, kind: 'confirm' | 'reject') {
    const who = `${r.displayName} (${r.phone}) — ${PLAN_LABELS[r.plan] ?? r.plan} ${formatBRL(r.amountCents)}`;
    if (kind === 'confirm' && !confirm(`Confirmar o pagamento de ${who}?\n\nO plano será liberado na hora.`)) return;
    const note = window.prompt(
      kind === 'confirm' ? 'Observação (pagamento conferido na InfinitePay):' : 'Motivo da rejeição:',
    ) ?? undefined;
    if (kind === 'reject' && note === undefined) return;

    setBusyId(r.id);
    setError(null);
    try {
      if (kind === 'confirm') await api.confirmSubscriptionRequest(token, r.id, note);
      else await api.rejectSubscriptionRequest(token, r.id, note);
      load();
    } catch {
      setError('Não foi possível concluir a ação.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">Carregando…</p>;
  if (items.length === 0) return <p className="muted">Nenhum pedido de assinatura pendente. 🎉</p>;

  return (
    <>
      <p className="muted">
        Confira o pagamento na InfinitePay antes de confirmar. Ao confirmar, o plano é liberado
        na hora (Mensal 30 · Trimestral 90 · Semestral 180 · Anual 365 dias).
      </p>
      <table>
        <thead>
          <tr>
            <th>Jogador</th>
            <th>Telefone</th>
            <th>Plano</th>
            <th>Valor</th>
            <th>Pedido em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>{r.displayName}</td>
              <td>{r.phone}</td>
              <td>{PLAN_LABELS[r.plan] ?? r.plan}</td>
              <td>{formatBRL(r.amountCents)}</td>
              <td>{new Date(r.requestedAt).toLocaleString('pt-BR')}</td>
              <td className="actions">
                <button className="approve" disabled={busyId === r.id} onClick={() => act(r, 'confirm')}>
                  Liberar plano
                </button>
                <button className="reject" disabled={busyId === r.id} onClick={() => act(r, 'reject')}>
                  Rejeitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
