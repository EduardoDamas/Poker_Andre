import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Login } from '../components/Login';

function stubFetch(handler: (url: string) => { status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const { status, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body == null ? '' : JSON.stringify(body)),
    } as Response;
  }));
}

describe('Login (admin username/password)', () => {
  it('logs in and calls onAuthed with the token', async () => {
    stubFetch((url) =>
      url.includes('/admin/auth/login')
        ? { status: 200, body: { accessToken: 'jwt-123' } }
        : { status: 200, body: {} },
    );
    const onAuthed = vi.fn();
    render(<Login onAuthed={onAuthed} />);

    await userEvent.type(screen.getByLabelText('Usuário'), 'admin');
    await userEvent.type(screen.getByLabelText('Senha'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onAuthed).toHaveBeenCalledWith('jwt-123');
  });

  it('shows an error on wrong credentials', async () => {
    stubFetch((url) =>
      url.includes('/admin/auth/login') ? { status: 401, body: null } : { status: 200, body: {} },
    );
    render(<Login onAuthed={() => {}} />);

    await userEvent.type(screen.getByLabelText('Usuário'), 'admin');
    await userEvent.type(screen.getByLabelText('Senha'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/incorretos/)).toBeInTheDocument();
  });
});
