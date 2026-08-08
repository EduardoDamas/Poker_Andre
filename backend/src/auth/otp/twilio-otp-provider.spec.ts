import { ConfigService } from '@nestjs/config';
import { TwilioOtpProvider } from './twilio-otp-provider';

/** Minimal ConfigService stub backed by a plain map. */
function cfg(vals: Record<string, string>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

describe('TwilioOtpProvider', () => {
  const base = {
    TWILIO_ACCOUNT_SID: 'AC123',
    TWILIO_AUTH_TOKEN: 'tok',
    TWILIO_FROM: '+15550001111',
  };
  afterEach(() => jest.restoreAllMocks());

  describe('isConfigured', () => {
    it('true with SID + token + From', () => {
      expect(TwilioOtpProvider.isConfigured(cfg(base))).toBe(true);
    });
    it('true with a Messaging Service instead of From', () => {
      expect(
        TwilioOtpProvider.isConfigured(
          cfg({
            TWILIO_ACCOUNT_SID: 'AC1',
            TWILIO_AUTH_TOKEN: 't',
            TWILIO_MESSAGING_SERVICE_SID: 'MG1',
          }),
        ),
      ).toBe(true);
    });
    it('false when a sender is missing', () => {
      expect(
        TwilioOtpProvider.isConfigured(
          cfg({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' }),
        ),
      ).toBe(false);
    });
  });

  describe('send', () => {
    it('POSTs to the Twilio Messages API with basic auth and the code', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 201 }));

      await new TwilioOtpProvider(cfg(base)).send('+5513999999999', '123456');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
      expect((init!.headers as Record<string, string>).Authorization).toBe(
        `Basic ${Buffer.from('AC123:tok').toString('base64')}`,
      );
      const body = (init!.body as URLSearchParams);
      expect(body.get('To')).toBe('+5513999999999');
      expect(body.get('From')).toBe('+15550001111');
      expect(body.get('Body')).toContain('123456');
    });

    it('throws on a non-2xx Twilio response', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('bad number', { status: 400 }));
      await expect(
        new TwilioOtpProvider(cfg(base)).send('+55', '000000'),
      ).rejects.toThrow(/HTTP 400/);
    });
  });
});
