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

describe('Login', () => {
  it('phone → code → onAuthed with the token', async () => {
    stubFetch((url) => {
      if (url.includes('/auth/otp/verify')) {
        return { status: 200, body: { accessToken: 'jwt-123', user: { id: 'a', displayName: 'Admin', status: 'ACTIVE' } } };
      }
      return { status: 200, body: {} };
    });
    const onAuthed = vi.fn();
    render(<Login onAuthed={onAuthed} />);

    await userEvent.type(screen.getByLabelText('Telefone'), '+5511990000000');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));

    await userEvent.type(await screen.findByLabelText('Código'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onAuthed).toHaveBeenCalledWith('jwt-123');
  });

  it('shows an error on a wrong code', async () => {
    stubFetch((url) => (url.includes('/verify') ? { status: 401, body: null } : { status: 200, body: {} }));
    render(<Login onAuthed={() => {}} />);

    await userEvent.type(screen.getByLabelText('Telefone'), '+5511990000000');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await userEvent.type(await screen.findByLabelText('Código'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/Código inválido/)).toBeInTheDocument();
  });
});
