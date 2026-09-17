import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Players } from '../components/Players';

function stubFetch(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }) as Response));
}

const DAY = 24 * 3600 * 1000;

function player(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    displayName: `Jogador ${id}`,
    phone: `+55119000000${id}`,
    status: 'ACTIVE',
    role: 'PLAYER',
    subscription: 'NONE',
    createdAt: new Date(Date.now() - 30 * DAY).toISOString(),
    balanceCents: '0',
    blocked: false,
    blockedUntil: null,
    blockReason: null,
    selfExcludedUntil: null,
    limitDailyCents: null,
    limitWeeklyCents: null,
    limitMonthlyCents: null,
    ...overrides,
  };
}

function countFor(label: string): string {
  const stat = screen.getByText(label).closest('.stat') as HTMLElement;
  return within(stat).getByText(/^\d+$/).textContent!;
}

describe('Players counters', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.useRealTimers());

  it('counts registered players by status and recency, excluding admins', async () => {
    stubFetch([
      player('1', { createdAt: new Date().toISOString() }), // joined today
      player('2', { status: 'PENDING', createdAt: new Date(Date.now() - 3 * DAY).toISOString() }),
      player('3', { blocked: true, blockReason: 'fraude' }),
      player('4'),
      player('9', { role: 'ADMIN', displayName: 'Admin' }), // not a player
    ]);

    render(<Players token="tok" onForbidden={() => {}} />);
    await screen.findByText('Jogadores cadastrados');

    expect(countFor('Jogadores cadastrados')).toBe('4');
    expect(countFor('Ativos')).toBe('2');
    expect(countFor('Pendentes')).toBe('1');
    expect(countFor('Bloqueados')).toBe('1');
    expect(countFor('Novos hoje')).toBe('1');
    expect(countFor('Últimos 7 dias')).toBe('2');
  });

  it('shows the limits a player set on themselves', async () => {
    stubFetch([
      player('1', { limitDailyCents: '50000', limitMonthlyCents: '200000' }),
      player('2'),
    ]);

    render(<Players token="tok" onForbidden={() => {}} />);
    await screen.findByText('Jogador 1');

    expect(screen.getByText('dia R$ 500,00 · mês R$ 2.000,00')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // player 2 has none
  });

  it('flags a self-excluded player', async () => {
    const until = new Date(Date.now() + 7 * DAY).toISOString();
    stubFetch([player('1', { selfExcludedUntil: until, limitDailyCents: '50000' })]);

    render(<Players token="tok" onForbidden={() => {}} />);
    expect(await screen.findByText(/AUTOEXCLUÍDO até/)).toBeInTheDocument();
  });

  it('refreshes the list automatically every minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubFetch([player('1')]);

    render(<Players token="tok" onForbidden={() => {}} />);
    await screen.findByText('Jogadores cadastrados');
    expect(fetch).toHaveBeenCalledTimes(1);

    stubFetch([player('1'), player('2')]);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetch).toHaveBeenCalledTimes(1); // the new stub has been called once
    await waitFor(() => expect(countFor('Jogadores cadastrados')).toBe('2'));
  });
});
