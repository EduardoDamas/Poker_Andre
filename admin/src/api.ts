// Client for the CAPA CONTEST admin/auth endpoints.
// Defaults to the live Render production backend; override with VITE_API_BASE
// (e.g. http://localhost:3000 for local backend dev).
const BASE: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE ??
  'https://capa-contest-api.onrender.com';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Admin sessions last 7 days (JWT_EXPIRES_IN). When the server refuses a stored
// session, the app is told once so it can show the login form again instead of
// every tab failing with a generic error.
let sessionExpired: (() => void) | null = null;
export function onSessionExpired(fn: (() => void) | null): void {
  sessionExpired = fn;
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
  const text = await res.text();
  if (res.status === 401 && token) sessionExpired?.();
  if (!res.ok) {
    // Keep the server's reason (e.g. "O prêmio do assinante não pode ser menor…").
    let reason = `Request failed (${res.status})`;
    try {
      const m = (JSON.parse(text) as { message?: string | string[] }).message;
      if (m) reason = Array.isArray(m) ? m.join('; ') : m;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, reason);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export interface Player {
  id: string;
  displayName: string;
  phone: string;
  status: string;
  role: string;
  subscription: string;
  createdAt: string;
  balanceCents: string;
  blocked: boolean;
  blockedUntil: string | null;
  blockReason: string | null;
  // Responsible gaming — limits the player set on themselves.
  selfExcludedUntil: string | null;
  limitDailyCents: string | null;
  limitWeeklyCents: string | null;
  limitMonthlyCents: string | null;
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

export interface Deposit {
  id: string;
  userId: string;
  amountCents: string;
  pixReference: string | null;
  status: string;
  requestedAt: string;
  settledAt: string | null;
  adminNote: string | null;
}

export type SubscriptionTier = 'NONE' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

/** A player's request to buy a plan through the fixed InfinitePay links. */
export interface SubscriptionRequest {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  plan: string;
  amountCents: string;
  status: string;
  checkoutUrl: string | null;
  adminNote: string | null;
  grantedUntil: string | null;
  requestedAt: string;
  settledAt: string | null;
}

/** A free promotion with one company-funded prize, played as a multi-table bracket. */
export interface PromoEvent {
  id: string;
  name: string;
  startsAt: string;
  prizeCents: string;
  prizeSubscriberCents: string;
  minPlayers: number;
  maxPlayers: number;
  /** Minutes past the start after which it starts with whoever is there; null = never. */
  waitMinutes: number | null;
  /** Rehearsal: robots that join at the start; nothing is paid. 0 = a real event. */
  robots: number;
  status: 'SCHEDULED' | 'PAID' | 'CANCELLED';
  winnerId: string | null;
  winnerName: string | null;
  winnerPhone: string | null;
  winnerSubscribed: boolean | null;
  prizePaidCents: string | null;
  paidAt: string | null;
  startedAt: string | null;
  startedWith: number | null;
  /**
   * Paid at the non-subscriber rate, but the winner asked for a plan before the
   * start: REQUESTED = release it in Assinaturas; CONFIRMED = the difference is due.
   */
  subscriberDifference: 'REQUESTED' | 'CONFIRMED' | null;
  /** The running bracket, while the server holds one. */
  live: {
    registered: number;
    started: boolean;
    startedWith: number;
    round: number;
    alive: number;
    tablesLeft: number;
    championId: string | null;
  } | null;
}

export interface NewPromoEvent {
  name: string;
  startsAt: string; // ISO
  prizeCents: number;
  prizeSubscriberCents: number;
  minPlayers: number;
  maxPlayers: number;
  waitMinutes: number | null;
  robots: number;
}

export interface Session {
  accessToken: string;
  user: { id: string; displayName: string; status: string };
}

export interface PendingOtp {
  phone: string;
  code: string;
  requestedAt: number;
}

export const api = {
  base: BASE,
  adminLogin: (username: string, password: string) =>
    request<{ accessToken: string }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  pendingOtps: (token: string) =>
    request<PendingOtp[]>('/admin/otp/pending', {}, token),
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
  // Deposits (manual Pix).
  deposits: (token: string, status?: string) =>
    request<Deposit[]>(`/admin/deposits${status ? `?status=${status}` : ''}`, {}, token),
  confirmDeposit: (token: string, id: string, adminNote?: string) =>
    request<Deposit>(
      `/admin/deposits/${id}/confirm`,
      { method: 'POST', body: JSON.stringify({ adminNote }) },
      token,
    ),
  rejectDeposit: (token: string, id: string, adminNote?: string) =>
    request<Deposit>(
      `/admin/deposits/${id}/reject`,
      { method: 'POST', body: JSON.stringify({ adminNote }) },
      token,
    ),
  // Subscription purchases (player paid via the fixed InfinitePay link).
  subscriptionRequests: (token: string, status = 'REQUESTED') =>
    request<SubscriptionRequest[]>(`/admin/subscription-requests?status=${status}`, {}, token),
  confirmSubscriptionRequest: (token: string, id: string, adminNote?: string) =>
    request<{ ok: true; plan: string; grantedUntil: string | null }>(
      `/admin/subscription-requests/${id}/confirm`,
      { method: 'POST', body: JSON.stringify({ adminNote }) },
      token,
    ),
  rejectSubscriptionRequest: (token: string, id: string, adminNote?: string) =>
    request<{ ok: true }>(
      `/admin/subscription-requests/${id}/reject`,
      { method: 'POST', body: JSON.stringify({ adminNote }) },
      token,
    ),
  // Promotions.
  promoEvents: (token: string) => request<PromoEvent[]>('/admin/promo-events', {}, token),
  createPromoEvent: (token: string, event: NewPromoEvent) =>
    request<PromoEvent>('/admin/promo-events', { method: 'POST', body: JSON.stringify(event) }, token),
  paySubscriberDifference: (token: string, id: string) =>
    request<{ ok: true; differenceCents: string }>(
      `/admin/promo-events/${id}/subscriber-difference`,
      { method: 'POST' },
      token,
    ),
  reschedulePromoEvent: (token: string, id: string, startsAt: string) =>
    request<PromoEvent>(
      `/admin/promo-events/${id}/reschedule`,
      { method: 'POST', body: JSON.stringify({ startsAt }) },
      token,
    ),
  cancelPromoEvent: (token: string, id: string) =>
    request<PromoEvent>(`/admin/promo-events/${id}/cancel`, { method: 'POST' }, token),
  // Subscription grant.
  grantSubscription: (token: string, id: string, subscription: SubscriptionTier, untilMs?: number) =>
    request<{ ok: true }>(
      `/admin/users/${id}/subscription`,
      { method: 'POST', body: JSON.stringify({ subscription, untilMs }) },
      token,
    ),
};
