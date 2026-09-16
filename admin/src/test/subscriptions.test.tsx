import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Subscriptions } from '../components/Subscriptions';

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

const pending = [
  {
    id: 's1',
    userId: 'u1',
    displayName: 'André Luiz',
    phone: '+5511988880001',
    plan: 'ANNUAL',
    amountCents: '150000',
    status: 'REQUESTED',
    checkoutUrl: 'https://link.infinitepay.io/andre-luiz-g4j/x-1500,00',
    adminNote: null,
    grantedUntil: null,
    requestedAt: '2026-09-16T12:00:00Z',
    settledAt: null,
  },
];

describe('Subscriptions queue', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists who paid, which plan and how much', async () => {
    stubFetch(() => ({ status: 200, body: pending }));
    render(<Subscriptions token="tok" onForbidden={() => {}} />);

    expect(await screen.findByText('André Luiz')).toBeInTheDocument();
    expect(screen.getByText('+5511988880001')).toBeInTheDocument();
    expect(screen.getByText('Anual')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.500,00')).toBeInTheDocument();
  });

  it('confirming calls the confirm endpoint and refreshes the queue', async () => {
    const calls: string[] = [];
    let list = pending;
    stubFetch((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/confirm')) return { status: 201, body: { ok: true, plan: 'ANNUAL', grantedUntil: null } };
      return { status: 200, body: list };
    });
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('prompt', () => 'conferido');

    render(<Subscriptions token="tok" onForbidden={() => {}} />);
    await screen.findByText('André Luiz');

    list = [];
    await userEvent.click(screen.getByRole('button', { name: 'Liberar plano' }));

    await waitFor(() => expect(screen.getByText(/Nenhum pedido/)).toBeInTheDocument());
    expect(calls.some((c) => c.includes('POST') && c.includes('/admin/subscription-requests/s1/confirm'))).toBe(true);
  });

  it('does nothing when the admin cancels the confirmation', async () => {
    const calls: string[] = [];
    stubFetch((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return { status: 200, body: pending };
    });
    vi.stubGlobal('confirm', () => false);

    render(<Subscriptions token="tok" onForbidden={() => {}} />);
    await screen.findByText('André Luiz');
    await userEvent.click(screen.getByRole('button', { name: 'Liberar plano' }));

    expect(calls.some((c) => c.includes('/confirm'))).toBe(false);
  });

  it('calls onForbidden when the API returns 403', async () => {
    stubFetch(() => ({ status: 403, body: null }));
    const onForbidden = vi.fn();
    render(<Subscriptions token="tok" onForbidden={onForbidden} />);
    await waitFor(() => expect(onForbidden).toHaveBeenCalled());
  });
});
