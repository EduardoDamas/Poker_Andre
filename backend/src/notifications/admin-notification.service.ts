import { Inject, Injectable } from '@nestjs/common';
import { ADMIN_NOTIFIER, AdminNotifier } from './admin-notifier';

/** Format integer cents as Brazilian currency, e.g. 12345n → "R$ 123,45". */
function brl(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const reais = (abs / 100n).toString();
  const centavos = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${centavos}`;
}

/**
 * Builds and sends admin alerts (never throws — a failed notification must not
 * break a money operation). Two events the operator (André) asked for:
 *   - a payout to make (withdrawal): carries the Pix key + amount;
 *   - a tournament prize awarded: carries the tournament + amount.
 */
@Injectable()
export class AdminNotificationService {
  constructor(@Inject(ADMIN_NOTIFIER) private readonly notifier: AdminNotifier) {}

  /** A player asked to withdraw — the admin must send the Pix manually. */
  async payoutRequested(p: { phone: string; pixKey: string; amountCents: bigint }): Promise<void> {
    await this.safeSend(
      '💸 Saque solicitado\n' +
        `Jogador: ${p.phone}\n` +
        `Chave Pix: ${p.pixKey}\n` +
        `Valor: ${brl(p.amountCents)}\n` +
        'Pague por Pix e marque como pago no painel.',
    );
  }

  /** A tournament champion was decided and a money prize awarded. */
  async prizeAwarded(p: {
    tournamentId: string;
    level: number;
    winnerId: string;
    prizeCents: bigint;
  }): Promise<void> {
    if (p.prizeCents <= 0n) return;
    await this.safeSend(
      '🏆 Prêmio de torneio\n' +
        `Torneio: ${p.tournamentId} (nível ${p.level})\n` +
        `Vencedor: ${p.winnerId}\n` +
        `Prêmio: ${brl(p.prizeCents)}\n` +
        'O jogador receberá em até 24h por Pix.',
    );
  }

  private async safeSend(message: string): Promise<void> {
    try {
      await this.notifier.send(message);
    } catch {
      // A notification failure must never break the money flow.
    }
  }
}
