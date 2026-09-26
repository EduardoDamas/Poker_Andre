import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Promotions, promoSituation, validatePromo } from '../components/Promotions';
import type { PromoEvent } from '../api';

function stubFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body == null ? '' : JSON.stringify(body)),
    } as Response;
  }));
}

const base: PromoEvent = {
  id: 'e1',
  name: 'Nível 0',
  startsAt: '2026-10-07T23:00:00.000Z',
  prizeCents: '25000',
  prizeSubscriberCents: '50000',
  minPlayers: 80,
  maxPlayers: 100,
  waitMinutes: 30,
  robots: 0,
  status: 'SCHEDULED',
  winnerId: null,
  winnerName: null,
  winnerPhone: null,
  winnerSubscribed: null,
  prizePaidCents: null,
  paidAt: null,
  startedAt: null,
  startedWith: null,
  subscriberDifference: null,
  live: null,
};
const START = Date.parse(base.startsAt);
const live = (over: Partial<NonNullable<PromoEvent['live']>>) => ({
  registered: 0, started: false, startedWith: 0, round: 0, alive: 0, tablesLeft: 0, championId: null, ...over,
});

describe('Promotions: where an event stands', () => {
  it('scheduled, room not open yet', () => {
    expect(promoSituation(base, START - 3_600_000)).toMatch(/^Agendada — a sala abre às/);
  });

  it('room open, counting registrations against the minimum', () => {
    expect(promoSituation({ ...base, live: live({ registered: 37 }) }, START - 60_000))
      .toBe('Sala aberta: 37 inscritos (mínimo 80)');
  });

  it('running: round, who is still in, tables still playing', () => {
    const e = { ...base, live: live({ started: true, startedWith: 92, round: 1, alive: 41, tablesLeft: 6 }) };
    expect(promoSituation(e, START + 600_000)).toBe('Em andamento: rodada 1 · 41 de 92 na disputa · 6 mesas jogando');
  });

  it('paid: who won, their phone and the prize', () => {
    const e: PromoEvent = {
      ...base, status: 'PAID', winnerId: 'u1', winnerName: 'Maria', winnerPhone: '+5513999990000',
      winnerSubscribed: true, prizePaidCents: '50000',
    };
    expect(promoSituation(e)).toBe('Paga: Maria (+5513999990000) — R$ 500,00 (assinante)');
  });

  it('a champion without a payment is flagged', () => {
    const e = { ...base, live: live({ started: true, championId: 'u9' }) };
    expect(promoSituation(e)).toMatch(/NÃO pago/);
  });

  it('a finished rehearsal says so, with no prize', () => {
    const e: PromoEvent = { ...base, robots: 20, status: 'PAID', winnerId: 'robot-4', prizePaidCents: '0' };
    expect(promoSituation(e)).toBe('Ensaio concluído — campeão: um robô (sem prêmio)');
    expect(promoSituation({ ...e, winnerId: 'u1', winnerName: 'Eduardo' })).toBe('Ensaio concluído — campeão: Eduardo (sem prêmio)');
  });

  it('cancelled, or never played', () => {
    expect(promoSituation({ ...base, status: 'CANCELLED' })).toBe('Cancelada');
    expect(promoSituation(base, START + 4 * 3_600_000)).toBe('Encerrada sem jogo');
  });
});

describe('Promotions: the form', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  const good = {
    name: 'Nível 0', startsAt: '2026-10-07T20:00', prize: '250', prizeSubscriber: '500',
    minPlayers: '80', maxPlayers: '100', waitMinutes: '30', noTolerance: false, rehearsal: false, robots: '20',
  };

  it("turns the operator's entries into the API's (cents, ISO, null tolerance)", () => {
    const { event } = validatePromo({ ...good, noTolerance: true }, now);
    expect(event).toMatchObject({
      name: 'Nível 0', prizeCents: 25000, prizeSubscriberCents: 50000, minPlayers: 80, maxPlayers: 100, waitMinutes: null,
    });
    expect(new Date(event!.startsAt).getTime()).toBe(new Date('2026-10-07T20:00').getTime());
    expect(validatePromo(good, now).event!.waitMinutes).toBe(30);
  });

  it('a real event has no robots; a rehearsal needs fewer robots than places', () => {
    expect(validatePromo(good, now).event!.robots).toBe(0);
    const r = { ...good, rehearsal: true, minPlayers: '2', maxPlayers: '30', robots: '20' };
    expect(validatePromo(r, now).event!.robots).toBe(20);
    expect(validatePromo({ ...r, robots: '30' }, now).error).toMatch(/robôs/);
    expect(validatePromo({ ...r, robots: '0' }, now).error).toMatch(/robôs/);
  });

  it('says what is wrong, in Portuguese', () => {
    expect(validatePromo({ ...good, prizeSubscriber: '200' }, now).error).toMatch(/assinante não pode ser menor/);
    expect(validatePromo({ ...good, maxPlayers: '120' }, now).error).toMatch(/vagas/);
    expect(validatePromo({ ...good, maxPlayers: '60' }, now).error).toMatch(/vagas/);
    expect(validatePromo({ ...good, startsAt: '2026-09-01T20:00' }, now).error).toMatch(/futuro/);
    expect(validatePromo({ ...good, startsAt: '' }, now).error).toMatch(/data e a hora/);
    expect(validatePromo({ ...good, prize: '0' }, now).error).toMatch(/maiores que zero/);
  });
});

describe('Promotions tab', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists promotions with their prizes and rules', async () => {
    stubFetch(() => ({ status: 200, body: [base] }));
    render(<Promotions token="tok" onForbidden={() => {}} />);
    expect(await screen.findByText('R$ 250,00 · assinante R$ 500,00')).toBeInTheDocument();
    expect(screen.getByText('mínimo 80 · 100 vagas · tolerância 30 min')).toBeInTheDocument();
  });

  it('schedules one after confirmation and sends what the operator typed', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    stubFetch((url, init) => {
      calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === 'POST') return { status: 201, body: base };
      return { status: 200, body: [] };
    });
    vi.stubGlobal('confirm', () => true);

    render(<Promotions token="tok" onForbidden={() => {}} />);
    await screen.findByText('Nenhuma promoção agendada.');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2099-10-07T20:00' } });
    await userEvent.click(screen.getByLabelText('Sem tolerância'));
    await userEvent.click(screen.getByRole('button', { name: 'Agendar promoção' }));

    await waitFor(() => expect(screen.getByText(/Promoção agendada/)).toBeInTheDocument());
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toMatch(/\/admin\/promo-events$/);
    expect(post.body).toMatchObject({
      name: 'Nível 0', prizeCents: 25000, prizeSubscriberCents: 50000, minPlayers: 80, maxPlayers: 100, waitMinutes: null,
    });
  });

  it('a rehearsal switches to its settings and warns that nothing is paid', async () => {
    const calls: { method: string; body?: unknown }[] = [];
    stubFetch((_url, init) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (init?.method === 'POST') return { status: 201, body: base };
      return { status: 200, body: [] };
    });
    let asked = '';
    vi.stubGlobal('confirm', (q: string) => ((asked = q), true));

    render(<Promotions token="tok" onForbidden={() => {}} />);
    await screen.findByText('Nenhuma promoção agendada.');
    await userEvent.click(screen.getByLabelText('Ensaio'));
    expect(screen.getByLabelText('Nome')).toHaveValue('Ensaio');
    expect(screen.getByLabelText('Robôs')).toHaveValue('90');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2099-10-05T20:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Agendar promoção' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(asked).toMatch(/ENSAIO.*NENHUM prêmio/);
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Ensaio', minPlayers: 2, maxPlayers: 100, waitMinutes: 0, robots: 90,
    });
  });

  it('does not call the API when the form is wrong', async () => {
    const calls: string[] = [];
    stubFetch((_url, init) => {
      calls.push(init?.method ?? 'GET');
      return { status: 200, body: [] };
    });
    render(<Promotions token="tok" onForbidden={() => {}} />);
    await screen.findByText('Nenhuma promoção agendada.');
    await userEvent.click(screen.getByRole('button', { name: 'Agendar promoção' }));

    expect(await screen.findByText('Informe a data e a hora de início.')).toBeInTheDocument();
    expect(calls).not.toContain('POST');
  });

  it("shows the server's reason when it refuses", async () => {
    stubFetch((_url, init) => {
      if (init?.method === 'POST') return { status: 400, body: { message: 'Os prêmios devem ser maiores que zero.' } };
      return { status: 200, body: [] };
    });
    vi.stubGlobal('confirm', () => true);
    render(<Promotions token="tok" onForbidden={() => {}} />);
    await screen.findByText('Nenhuma promoção agendada.');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2099-10-07T20:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Agendar promoção' }));
    expect(await screen.findByText('Os prêmios devem ser maiores que zero.')).toBeInTheDocument();
  });

  it('cancels after confirmation', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/cancel')) return { status: 201, body: { ...base, status: 'CANCELLED' } };
      return { status: 200, body: [base] };
    });
    vi.stubGlobal('confirm', () => true);
    render(<Promotions token="tok" onForbidden={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST') && c.includes('/admin/promo-events/e1/cancel'))).toBe(true));
  });

  const paidLow: PromoEvent = {
    ...base, status: 'PAID', winnerId: 'u1', winnerName: 'Maria', winnerPhone: '+5513999990000',
    winnerSubscribed: false, prizePaidCents: '25000',
  };

  it('tells the operator to release a pre-start plan before paying the difference', async () => {
    stubFetch(() => ({ status: 200, body: [{ ...paidLow, subscriberDifference: 'REQUESTED' }] }));
    render(<Promotions token="tok" onForbidden={() => {}} />);
    expect(await screen.findByText(/Libere o plano em Assinaturas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pagar diferença' })).toBeNull();
  });

  it('pays the subscriber difference once the plan is released', async () => {
    const calls: string[] = [];
    let list: PromoEvent[] = [{ ...paidLow, subscriberDifference: 'CONFIRMED' }];
    stubFetch((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/subscriber-difference')) return { status: 201, body: { ok: true, differenceCents: '25000' } };
      return { status: 200, body: list };
    });
    let asked = '';
    vi.stubGlobal('confirm', (q: string) => ((asked = q), true));
    render(<Promotions token="tok" onForbidden={() => {}} />);

    list = [{ ...paidLow, winnerSubscribed: true, prizePaidCents: '50000' }];
    await userEvent.click(await screen.findByRole('button', { name: 'Pagar diferença' }));
    expect(asked).toMatch(/R\$ 250,00 \(total R\$ 500,00\)/);
    await waitFor(() => expect(calls.some((c) => c.startsWith('POST') && c.includes('/admin/promo-events/e1/subscriber-difference'))).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pagar diferença' })).toBeNull());
  });

  it('an interrupted promotion (server restarted mid-tournament) can be rescheduled', async () => {
    const interrupted: PromoEvent = { ...base, startedAt: '2026-10-07T22:31:00.000Z', startedWith: 88 };
    expect(promoSituation(interrupted)).toMatch(/^INTERROMPIDA/);
    const calls: { url: string; body?: { startsAt: string } }[] = [];
    stubFetch((url, init) => {
      if (init?.method === 'POST') calls.push({ url, body: JSON.parse(String(init.body)) });
      return { status: 200, body: [interrupted] };
    });
    vi.stubGlobal('prompt', () => '10');
    render(<Promotions token="tok" onForbidden={() => {}} />);
    const before = Date.now();
    await userEvent.click(await screen.findByRole('button', { name: 'Remarcar' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toMatch(/\/admin\/promo-events\/e1\/reschedule$/);
    const at = Date.parse(calls[0].body!.startsAt);
    expect(at - before).toBeGreaterThanOrEqual(9.9 * 60_000);
    expect(at - before).toBeLessThan(10.5 * 60_000);
  });

  it('calls onForbidden when the API returns 403', async () => {
    stubFetch(() => ({ status: 403, body: null }));
    const onForbidden = vi.fn();
    render(<Promotions token="tok" onForbidden={onForbidden} />);
    await waitFor(() => expect(onForbidden).toHaveBeenCalled());
  });
});
