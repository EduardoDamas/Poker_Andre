// Client for the CAPA CONTEST admin/auth endpoints.
const BASE: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export interface Player {
  id: string;
  displayName: string;
  phone: string;
  status: string;
  role: string;
  balanceCents: string;
  blocked: boolean;
  blockedUntil: string | null;
  blockReason: string | null;
}

export interface Withdrawal {
  id: string;
  userId: string;
  amountCents: string;
  pixKey: string;
  status: string;
  requestedAt: string;
  settledAt: string | null;
  adminNote: string | null;
}

export interface Session {
  accessToken: string;
  user: { id: string; displayName: string; status: string };
}

export const api = {
  base: BASE,
  requestOtp: (phone: string) =>
    request<void>('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) =>
    request<Session>('/auth/otp/verify', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  players: (token: string) => request<Player[]>('/admin/players', {}, token),
  withdrawals: (token: string, status?: string) =>
    request<Withdrawal[]>(`/admin/withdrawals${status ? `?status=${status}` : ''}`, {}, token),
  approve: (token: string, id: string, adminNote?: string) =>
    request<Withdrawal>(
      `/admin/withdrawals/${id}/approve`,
      { method: 'POST', body: JSON.stringify({ adminNote }) },
      token,
    ),
  reject: (token: string, id: string, adminNote?: string) =>
    request<Withdrawal>(
      `/admin/withdrawals/${id}/reject`,
      { method: 'POST', body: JSON.stringify({ adminNote }) },
      token,
    ),
  // User management.
  rejectUser: (token: string, id: string) =>
    request<{ ok: true }>(`/admin/users/${id}/reject`, { method: 'POST' }, token),
  blockUser: (token: string, id: string, reason: string, untilMs?: number) =>
    request<{ ok: true }>(
      `/admin/users/${id}/block`,
      { method: 'POST', body: JSON.stringify({ reason, untilMs }) },
      token,
    ),
  unblockUser: (token: string, id: string) =>
    request<{ ok: true }>(`/admin/users/${id}/unblock`, { method: 'POST' }, token),
};
