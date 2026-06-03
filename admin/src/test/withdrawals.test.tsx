import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Withdrawals } from '../components/Withdrawals';

// Helper: a fetch stub that routes by URL + method.
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
    id: 'w1',
    userId: 'u1',
    amountCents: '3000',
    pixKey: 'p@pix.com',
    status: 'REQUESTED',
    requestedAt: '2026-06-03T12:00:00Z',
    settledAt: null,
    adminNote: null,
  },
];

describe('Withdrawals', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('lists pending withdrawals with formatted amount', async () => {
    stubFetch(() => ({ status: 200, body: pending }));
    render(<Withdrawals token="tok" onForbidden={() => {}} />);

    expect(await screen.findByText('R$ 30,00')).toBeInTheDocument();
    expect(screen.getByText('p@pix.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeInTheDocument();
  });

  it('approves a withdrawal: calls the approve endpoint and refreshes', async () => {
    const calls: string[] = [];
    let listResponse = pending;
    stubFetch((url, init) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/approve')) return { status: 201, body: { ...pending[0], status: 'PAID' } };
      return { status: 200, body: listResponse };
    });
    vi.stubGlobal('prompt', () => 'paid');

    render(<Withdrawals token="tok" onForbidden={() => {}} />);
    await screen.findByText('R$ 30,00');

    listResponse = []; // after approval the list is empty
    await userEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    await waitFor(() => expect(screen.getByText(/Nenhum saque pendente/)).toBeInTheDocument());
    expect(calls.some((c) => c.includes('POST') && c.includes('/admin/withdrawals/w1/approve'))).toBe(true);
  });

  it('calls onForbidden when the API returns 403 (non-admin)', async () => {
    stubFetch(() => ({ status: 403, body: null }));
    const onForbidden = vi.fn();
    render(<Withdrawals token="tok" onForbidden={onForbidden} />);
    await waitFor(() => expect(onForbidden).toHaveBeenCalled());
  });
});
