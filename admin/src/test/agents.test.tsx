import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Agents } from '../components/Agents';
import { Players } from '../components/Players';

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown };

function stubFetch(handler: Handler) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const { status, body } = handler(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body == null ? '' : JSON.stringify(body)),
    } as Response;
  }));
  return calls;
}

const joao = {
  id: 'a1',
  name: 'João Silva',
  code: 'JOAO10',
  phone: '+5511999990000',
  commissionPct: 10,
  active: true,
  createdAt: '2026-10-12T12:00:00Z',
  players: 2,
  subscribers: 1,
  baseCents: '23000',
  commissionCents: '2300',
};

const report = {
  ...joao,
  referred: [
    {
      userId: 'u1',
      displayName: 'Ana',
      phone: '+5511988880001',
      linkedAt: '2026-10-12T12:00:00Z',
      subscription: 'QUARTERLY',
      firstSubscription: { plan: 'QUARTERLY', amountCents: '15000', at: '2026-10-12T12:00:00Z' },
      firstDeposit: { amountCents: '5000', at: '2026-10-13T12:00:00Z', via: 'CARTAO' },
      baseCents: '20000',
      commissionCents: '2000',
    },
  ],
};

describe('Agents tab', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists agents with their code, referred players and commission', async () => {
    stubFetch(() => ({ status: 200, body: [joao, { ...joao, id: 'a2', name: 'Maria', code: 'MARIA20', active: false, commissionPct: null, commissionCents: null }] }));
    render(<Agents token="tok" onForbidden={() => {}} />);

    const row = (await screen.findByText('JOAO10')).closest('tr') as HTMLElement;
    expect(within(row).getByText('R$ 230,00')).toBeInTheDocument(); // base
    expect(within(row).getByText('R$ 23,00')).toBeInTheDocument(); // 10%
    const maria = screen.getByText('MARIA20').closest('tr') as HTMLElement;
    expect(within(maria).getByText('INATIVO')).toBeInTheDocument();
    expect(within(maria).getByText('sem % definida')).toBeInTheDocument();
    expect(screen.getByText(/Anual 3.000/)).toBeInTheDocument(); // the bonus chips are explained
  });

  it('creates an agent with the typed code and percentage', async () => {
    let list: unknown[] = [];
    const calls = stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        list = [joao];
        return { status: 201, body: joao };
      }
      return { status: 200, body: list };
    });
    vi.stubGlobal('alert', vi.fn());
    render(<Agents token="tok" onForbidden={() => {}} />);
    await screen.findByText(/Nenhum agente/);

    await userEvent.type(screen.getByLabelText('Nome'), 'João Silva');
    await userEvent.type(screen.getByLabelText(/Código/), 'joao10');
    await userEvent.type(screen.getByLabelText(/Comissão %/), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Criar agente' }));

    await screen.findByText('JOAO10');
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toMatch(/\/admin\/agents$/);
    expect(post.body).toEqual({ name: 'João Silva', code: 'JOAO10', commissionPct: 10 });
    expect(alert).toHaveBeenCalledWith('Agente criado. Código: JOAO10');
  });

  it("shows the server's reason when the code is taken", async () => {
    stubFetch((_url, init) =>
      init?.method === 'POST'
        ? { status: 409, body: { message: 'O código JOAO10 já é de outro agente.' } }
        : { status: 200, body: [] },
    );
    render(<Agents token="tok" onForbidden={() => {}} />);
    await screen.findByText(/Nenhum agente/);
    await userEvent.type(screen.getByLabelText('Nome'), 'Outro');
    await userEvent.type(screen.getByLabelText(/Código/), 'JOAO10');
    await userEvent.click(screen.getByRole('button', { name: 'Criar agente' }));
    expect(await screen.findByText('O código JOAO10 já é de outro agente.')).toBeInTheDocument();
  });

  it("opens an agent's report: first subscription, first deposit, base and commission", async () => {
    stubFetch((url) => ({ status: 200, body: url.endsWith('/report') ? report : [joao] }));
    render(<Agents token="tok" onForbidden={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Relatório' }));

    const section = await screen.findByRole('region', { name: /Relatório de João Silva/ });
    const ana = within(section).getByText('Ana').closest('tr') as HTMLElement;
    expect(within(ana).getByText(/Trimestral/)).toBeInTheDocument();
    expect(within(ana).getByText(/R\$ 50,00 · Cartão/)).toBeInTheDocument();
    expect(within(ana).getByText('R$ 200,00')).toBeInTheDocument();
    expect(within(ana).getByText('R$ 20,00')).toBeInTheDocument();
  });

  it('deactivating asks first, then sends active=false', async () => {
    const calls = stubFetch((_url, init) => ({ status: 200, body: init?.method === 'PATCH' ? { ...joao, active: false } : [joao] }));
    vi.stubGlobal('confirm', () => true);
    render(<Agents token="tok" onForbidden={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/admin\/agents\/a1$/);
    expect(patch.body).toEqual({ active: false });
  });

  it('calls onForbidden on 403', async () => {
    stubFetch(() => ({ status: 403, body: null }));
    const onForbidden = vi.fn();
    render(<Agents token="tok" onForbidden={onForbidden} />);
    await waitFor(() => expect(onForbidden).toHaveBeenCalled());
  });
});

describe('Players tab — agent column', () => {
  beforeEach(() => vi.restoreAllMocks());

  const player = {
    id: 'u9', displayName: 'Bruno', phone: '+5511900000009', status: 'ACTIVE', role: 'PLAYER',
    subscription: 'NONE', createdAt: '2026-10-01T12:00:00Z', balanceCents: '0', blocked: false,
    blockedUntil: null, blockReason: null, selfExcludedUntil: null, limitDailyCents: null,
    limitWeeklyCents: null, limitMonthlyCents: null, agentCode: null as string | null,
  };

  it('links a player to an agent by code', async () => {
    let current = player;
    const calls = stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        current = { ...player, agentCode: 'JOAO10' };
        return { status: 201, body: { ok: true, agentId: 'a1', code: 'JOAO10' } };
      }
      return { status: 200, body: [current] };
    });
    vi.stubGlobal('prompt', () => 'joao10');
    render(<Players token="tok" onForbidden={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Vincular' }));
    expect(await screen.findByText('JOAO10')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toMatch(/\/admin\/users\/u9\/agent$/);
    expect(post.body).toEqual({ code: 'joao10' });
    expect(screen.getByRole('button', { name: 'Alterar' })).toBeInTheDocument();
  });

  it('an empty code unlinks', async () => {
    const calls = stubFetch((_url, init) =>
      init?.method === 'POST'
        ? { status: 201, body: { ok: true, agentId: null, code: null } }
        : { status: 200, body: [{ ...player, agentCode: 'JOAO10' }] },
    );
    vi.stubGlobal('prompt', () => '  ');
    render(<Players token="tok" onForbidden={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Alterar' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ code: null });
  });
});

describe('Agents tab — players who invite players', () => {
  beforeEach(() => vi.restoreAllMocks());

  const maria = {
    userId: 'm1', displayName: 'Maria', phone: '+5511911110000', code: 'MARIA47',
    invited: 3, subscribers: 2, commissionCents: '11900',
  };
  const report = {
    ...maria,
    referred: [
      {
        userId: 'a1', displayName: 'Ana', phone: '+5511922220000', referredAt: '2026-10-15T12:00:00Z', subscription: 'QUARTERLY',
        firstSubscription: { plan: 'QUARTERLY', amountCents: '15000', at: '2026-10-15T12:00:00Z' },
        firstEntry: { amountCents: '4000', at: '2026-10-16T12:00:00Z' },
        pct: 10, baseCents: '19000', commissionCents: '1900',
      },
      {
        userId: 'b1', displayName: 'Bruno', phone: '+5511933330000', referredAt: null, subscription: 'NONE',
        firstSubscription: null, firstEntry: { amountCents: '2000', at: '2026-10-16T12:00:00Z' },
        pct: 0, baseCents: '2000', commissionCents: '0',
      },
    ],
  };

  it('lists who invited whom and opens the commission report', async () => {
    stubFetch((u) => ({
      status: 200,
      body: u.endsWith('/admin/referrals') ? [maria] : u.includes('/admin/referrals/m1') ? report : [],
    }));
    render(<Agents token="tok" onForbidden={() => {}} />);
    const section = await screen.findByRole('region', { name: 'Indicações de jogadores' });
    const row = (await within(section).findByText('MARIA47')).closest('tr') as HTMLElement;
    expect(within(row).getByText('R$ 119,00')).toBeInTheDocument();
    expect(within(section).getByText(/Anual 20%/)).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Relatório' }));
    const rep = await screen.findByRole('region', { name: 'Indicados de Maria' });
    const ana = within(rep).getByText('Ana').closest('tr') as HTMLElement;
    expect(within(ana).getByText('10%')).toBeInTheDocument();
    expect(within(ana).getByText('R$ 19,00')).toBeInTheDocument();
    const bruno = within(rep).getByText('Bruno').closest('tr') as HTMLElement;
    expect(within(bruno).getByText('R$ 0,00')).toBeInTheDocument();
  });
});

describe('Players tab — invited by a player', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows the code and name of who invited them', async () => {
    stubFetch(() => ({
      status: 200,
      body: [{
        id: 'u9', displayName: 'Bruno', phone: '+5511900000009', status: 'ACTIVE', role: 'PLAYER',
        subscription: 'NONE', createdAt: '2026-10-01T12:00:00Z', balanceCents: '0', blocked: false,
        blockedUntil: null, blockReason: null, selfExcludedUntil: null, limitDailyCents: null,
        limitWeeklyCents: null, limitMonthlyCents: null, agentCode: null, referrerCode: 'MARIA47', referrerName: 'Maria',
      }],
    }));
    render(<Players token="tok" onForbidden={() => {}} />);
    expect(await screen.findByText('MARIA47')).toBeInTheDocument();
    expect(screen.getByText('(Maria)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alterar' })).toBeInTheDocument();
  });
});
