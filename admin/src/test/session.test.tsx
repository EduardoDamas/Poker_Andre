import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';

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

const bearer = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.Authorization;

/**
 * Admin sessions last 7 days. A stored session the server refuses must bring
 * back the login form — not leave every tab saying "Falha ao carregar".
 */
describe('Expired admin session', () => {
  beforeEach(() => localStorage.clear());

  it('shows the login form with the reason, then works again after logging in', async () => {
    localStorage.setItem('capa_admin_token', 'old-token');
    stubFetch((url, init) => {
      if (url.includes('/admin/auth/login')) {
        const body = JSON.parse(String(init?.body));
        return body.password === 'certa' ? { status: 201, body: { accessToken: 'new-token' } } : { status: 401, body: null };
      }
      if (bearer(init) === 'Bearer old-token') return { status: 401, body: { message: 'Unauthorized' } };
      return { status: 200, body: [] };
    });

    render(<App />);
    expect(await screen.findByText('Sua sessão expirou. Entre novamente.')).toBeInTheDocument();
    expect(localStorage.getItem('capa_admin_token')).toBeNull();

    await userEvent.type(screen.getByLabelText('Usuário'), 'admin');
    await userEvent.type(screen.getByLabelText('Senha'), 'certa');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(localStorage.getItem('capa_admin_token')).toBe('new-token'));
    expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.queryByText(/Falha ao carregar/)).toBeNull();
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
  });

  it('a wrong password on the login form is not taken for an expired session', async () => {
    stubFetch(() => ({ status: 401, body: null }));
    render(<App />);
    await userEvent.type(await screen.findByLabelText('Usuário'), 'admin');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/incorretos/)).toBeInTheDocument();
    expect(screen.queryByText(/sessão expirou/)).toBeNull();
  });
});
