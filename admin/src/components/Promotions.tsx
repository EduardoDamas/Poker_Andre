import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, PromoEvent, NewPromoEvent } from '../api';
import { formatBRL } from '../money';

/** The room opens this long before the start (backend PROMO_OPENS_MINUTES_BEFORE). */
const OPENS_MINUTES_BEFORE = 30;
/** An unplayed event leaves the lobby this long after its start. */
const CLOSES_HOURS_AFTER = 3;
/** 10 tables of up to 10 players → one final table of 10. */
const MAX_PLACES = 100;

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Where an event stands right now, in words for the operator. */
export function promoSituation(e: PromoEvent, now = Date.now()): string {
  if (e.status === 'CANCELLED') return 'Cancelada';
  if (e.status === 'PAID') {
    const who = e.winnerName ? `${e.winnerName} (${e.winnerPhone ?? '—'})` : e.winnerId ?? '—';
    const prize = e.prizePaidCents ? formatBRL(e.prizePaidCents) : '—';
    return `Paga: ${who} — ${prize}${e.winnerSubscribed ? ' (assinante)' : ''}`;
  }
  const live = e.live;
  if (live?.started && live.championId) return 'Campeão definido, prêmio NÃO pago — verificar a conta do vencedor';
  if (live?.started) {
    const tables = live.tablesLeft === 1 ? '1 mesa jogando' : `${live.tablesLeft} mesas jogando`;
    return `Em andamento: rodada ${live.round} · ${live.alive} de ${live.startedWith} na disputa · ${tables}`;
  }
  const starts = new Date(e.startsAt).getTime();
  const opens = starts - OPENS_MINUTES_BEFORE * 60_000;
  if (now < opens) return `Agendada — a sala abre às ${hhmm(new Date(opens))}`;
  if (now > starts + CLOSES_HOURS_AFTER * 3_600_000) return 'Encerrada sem jogo';
  return `Sala aberta: ${live?.registered ?? 0} inscritos (mínimo ${e.minPlayers})`;
}

const rules = (e: PromoEvent) =>
  `mínimo ${e.minPlayers} · ${e.maxPlayers} vagas · ` +
  (e.waitMinutes === null ? 'sem tolerância' : `tolerância ${e.waitMinutes} min`);

interface Form {
  name: string;
  startsAt: string; // datetime-local, this computer's time zone
  prize: string; // reais
  prizeSubscriber: string;
  minPlayers: string;
  maxPlayers: string;
  waitMinutes: string;
  noTolerance: boolean;
}

const EMPTY: Form = {
  name: 'Nível 0',
  startsAt: '',
  prize: '250',
  prizeSubscriber: '500',
  minPlayers: '80',
  maxPlayers: '100',
  waitMinutes: '30',
  noTolerance: false,
};

const reaisToCents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);

/** The form, checked here so the operator reads the problem in Portuguese. */
export function validatePromo(f: Form, now = Date.now()): { event?: NewPromoEvent; error?: string } {
  const start = new Date(f.startsAt);
  const prizeCents = reaisToCents(f.prize);
  const prizeSubscriberCents = reaisToCents(f.prizeSubscriber);
  const minPlayers = Number(f.minPlayers);
  const maxPlayers = Number(f.maxPlayers);
  const waitMinutes = f.noTolerance ? null : Number(f.waitMinutes);
  if (!f.name.trim()) return { error: 'Dê um nome à promoção.' };
  if (!f.startsAt || Number.isNaN(start.getTime())) return { error: 'Informe a data e a hora de início.' };
  if (start.getTime() <= now) return { error: 'O início precisa ser no futuro.' };
  if (!(prizeCents > 0) || !(prizeSubscriberCents > 0)) return { error: 'Os prêmios devem ser maiores que zero.' };
  if (prizeSubscriberCents < prizeCents) return { error: 'O prêmio do assinante não pode ser menor que o do não assinante.' };
  if (!Number.isInteger(minPlayers) || minPlayers < 2) return { error: 'O mínimo de participantes deve ser 2 ou mais.' };
  if (!Number.isInteger(maxPlayers) || maxPlayers < minPlayers || maxPlayers > MAX_PLACES) {
    return { error: `As vagas devem ficar entre o mínimo e ${MAX_PLACES}.` };
  }
  if (waitMinutes !== null && (!Number.isInteger(waitMinutes) || waitMinutes < 0 || waitMinutes > 150)) {
    return { error: 'A tolerância deve ser de 0 a 150 minutos.' };
  }
  return {
    event: {
      name: f.name.trim(),
      startsAt: start.toISOString(),
      prizeCents,
      prizeSubscriberCents,
      minPlayers,
      maxPlayers,
      waitMinutes,
    },
  };
}

/// Promotions: free entry, one prize paid by the company, played as a
/// multi-table bracket (tables play down to one winner, the winners meet at a
/// final table). Schedule one here, follow it live on the day, see who won.
export function Promotions({ token, onForbidden }: { token: string; onForbidden: () => void }) {
  const [items, setItems] = useState<PromoEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .promoEvents(token)
      .then((list) => {
        setItems(list);
        setLoadError(null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) onForbidden();
        else setLoadError('Falha ao carregar as promoções.');
      });
  }, [token, onForbidden]);

  useEffect(() => {
    load();
    // Live on the day: registrations, rounds and the champion show up on their own.
    const timer = setInterval(load, 5_000);
    return () => clearInterval(timer);
  }, [load]);

  const set = (k: keyof Form) => (ev: { target: { value: string; checked?: boolean; type?: string } }) =>
    setForm((f) => ({ ...f, [k]: ev.target.type === 'checkbox' ? !!ev.target.checked : ev.target.value }));

  async function create(ev: FormEvent) {
    ev.preventDefault();
    setNotice(null);
    const { event, error } = validatePromo(form);
    if (!event) {
      setFormError(error ?? 'Confira os dados.');
      return;
    }
    setFormError(null);
    const summary =
      `${event.name} — início ${when(event.startsAt)}\n` +
      `Prêmio ${formatBRL(event.prizeCents)} · assinante ${formatBRL(event.prizeSubscriberCents)}\n` +
      `Mínimo ${event.minPlayers} · ${event.maxPlayers} vagas · ` +
      (event.waitMinutes === null
        ? 'sem tolerância (espera o mínimo)'
        : `tolerância ${event.waitMinutes} min (depois começa com quem estiver)`) +
      `\n\nA sala aparece no app ${OPENS_MINUTES_BEFORE} minutos antes do início.`;
    if (!confirm(`Agendar esta promoção?\n\n${summary}`)) return;
    setBusy(true);
    try {
      await api.createPromoEvent(token, event);
      setForm(EMPTY);
      setNotice(`Promoção agendada para ${when(event.startsAt)}.`);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível agendar.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(e: PromoEvent) {
    const running = e.live?.started;
    const question = running
      ? `A promoção "${e.name}" está EM ANDAMENTO. Cancelar agora faz o prêmio NÃO ser pago ao campeão.\n\nCancelar mesmo assim?`
      : `Cancelar a promoção "${e.name}" de ${when(e.startsAt)}? Ela sai do app.`;
    if (!confirm(question)) return;
    setBusy(true);
    try {
      await api.cancelPromoEvent(token, e.id);
      load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Não foi possível cancelar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Agendar promoção</h2>
      <p className="muted">
        Entrada grátis, um único prêmio pago pela empresa. Mesas de 8 (9–10 acima de 80 inscritos)
        jogam até sobrar um; os vencedores vão para a mesa final. A sala aparece no app{' '}
        {OPENS_MINUTES_BEFORE} minutos antes do início.
      </p>
      <form className="promo-form" onSubmit={create}>
        <label>
          Nome
          <input value={form.name} onChange={set('name')} aria-label="Nome" />
        </label>
        <label>
          Início (horário deste computador)
          <input type="datetime-local" value={form.startsAt} onChange={set('startsAt')} aria-label="Início" />
        </label>
        <label>
          Prêmio (R$)
          <input inputMode="decimal" value={form.prize} onChange={set('prize')} aria-label="Prêmio" />
        </label>
        <label>
          Prêmio assinante (R$)
          <input inputMode="decimal" value={form.prizeSubscriber} onChange={set('prizeSubscriber')} aria-label="Prêmio assinante" />
        </label>
        <label>
          Mínimo para começar
          <input inputMode="numeric" value={form.minPlayers} onChange={set('minPlayers')} aria-label="Mínimo" />
        </label>
        <label>
          Vagas (até {MAX_PLACES})
          <input inputMode="numeric" value={form.maxPlayers} onChange={set('maxPlayers')} aria-label="Vagas" />
        </label>
        <label>
          Tolerância (min)
          <input
            inputMode="numeric"
            value={form.waitMinutes}
            onChange={set('waitMinutes')}
            disabled={form.noTolerance}
            aria-label="Tolerância"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.noTolerance} onChange={set('noTolerance')} aria-label="Sem tolerância" />
          Sem tolerância: só começa com o mínimo
        </label>
        <button type="submit" disabled={busy}>
          Agendar promoção
        </button>
      </form>
      {formError && <p className="error">{formError}</p>}
      {notice && <p className="ok">{notice}</p>}

      <h2>Promoções</h2>
      {loadError && <p className="error">{loadError}</p>}
      {!items ? (
        <p className="muted">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="muted">Nenhuma promoção agendada.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Promoção</th>
              <th>Início</th>
              <th>Prêmio</th>
              <th>Regras</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{when(e.startsAt)}</td>
                <td>
                  {formatBRL(e.prizeCents)} · assinante {formatBRL(e.prizeSubscriberCents)}
                </td>
                <td>{rules(e)}</td>
                <td>{promoSituation(e)}</td>
                <td className="actions">
                  {e.status === 'SCHEDULED' && (
                    <button className="reject" disabled={busy} onClick={() => cancel(e)}>
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
