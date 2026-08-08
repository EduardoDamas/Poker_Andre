import { AdminNotificationService } from './admin-notification.service';
import { AdminNotifier } from './admin-notifier';

class CapturingNotifier implements AdminNotifier {
  messages: string[] = [];
  async send(m: string): Promise<void> {
    this.messages.push(m);
  }
}

describe('AdminNotificationService', () => {
  it('formats a payout alert with the phone, Pix key and amount', async () => {
    const n = new CapturingNotifier();
    await new AdminNotificationService(n).payoutRequested({
      phone: '+5511999998888',
      pixKey: 'jogador@pix.com',
      amountCents: 12345n,
    });
    expect(n.messages).toHaveLength(1);
    expect(n.messages[0]).toContain('+5511999998888');
    expect(n.messages[0]).toContain('jogador@pix.com');
    expect(n.messages[0]).toContain('R$ 123,45');
  });

  it('formats a prize alert with tournament + amount and skips zero prizes', async () => {
    const n = new CapturingNotifier();
    const svc = new AdminNotificationService(n);
    await svc.prizeAwarded({ tournamentId: 'mtt-1', level: 3, winnerId: 'u1', prizeCents: 10000n });
    expect(n.messages[0]).toContain('mtt-1');
    expect(n.messages[0]).toContain('nível 3');
    expect(n.messages[0]).toContain('R$ 100,00');
    await svc.prizeAwarded({ tournamentId: 'mtt-2', level: 1, winnerId: 'u2', prizeCents: 0n });
    expect(n.messages).toHaveLength(1); // zero prize → no alert
  });

  it('never throws when the channel fails', async () => {
    const failing: AdminNotifier = {
      send: async () => {
        throw new Error('channel down');
      },
    };
    await expect(
      new AdminNotificationService(failing).payoutRequested({ phone: 'p', pixKey: 'k', amountCents: 100n }),
    ).resolves.toBeUndefined();
  });
});
