import { ConfigService } from '@nestjs/config';
import { WhatsAppOtpProvider } from './whatsapp-otp-provider';

function cfg(vals: Record<string, string>): ConfigService {
  return { get: (k: string) => vals[k] } as unknown as ConfigService;
}

describe('WhatsAppOtpProvider', () => {
  const base = {
    WHATSAPP_PHONE_NUMBER_ID: '123456',
    WHATSAPP_TOKEN: 'tok',
    WHATSAPP_OTP_TEMPLATE: 'login_code',
  };
  afterEach(() => jest.restoreAllMocks());

  describe('isConfigured', () => {
    it('true with phone-number id + token + template', () => {
      expect(WhatsAppOtpProvider.isConfigured(cfg(base))).toBe(true);
    });
    it('false when the template is missing', () => {
      expect(
        WhatsAppOtpProvider.isConfigured(
          cfg({ WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_TOKEN: 't' }),
        ),
      ).toBe(false);
    });
  });

  describe('send', () => {
    it('POSTs an authentication template with the code in body + button', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await new WhatsAppOtpProvider(cfg(base)).send('+55 (13) 99600-1429', '654321');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://graph.facebook.com/v21.0/123456/messages');
      expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      const payload = JSON.parse(init!.body as string);
      expect(payload.type).toBe('template');
      expect(payload.to).toBe('5513996001429'); // digits only, no '+'
      expect(payload.template.name).toBe('login_code');
      expect(payload.template.language.code).toBe('pt_BR');
      // code appears in the body param and the button param
      expect(payload.template.components[0].parameters[0].text).toBe('654321');
      expect(payload.template.components[1].type).toBe('button');
      expect(payload.template.components[1].parameters[0].text).toBe('654321');
    });

    it('omits the button component when WHATSAPP_OTP_BUTTON=false', async () => {
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }));

      await new WhatsAppOtpProvider(
        cfg({ ...base, WHATSAPP_OTP_BUTTON: 'false' }),
      ).send('5511999998888', '111222');

      const payload = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
      expect(payload.template.components).toHaveLength(1);
      expect(payload.template.components[0].type).toBe('body');
    });

    it('throws on a non-2xx Meta response', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('bad template', { status: 400 }));
      await expect(
        new WhatsAppOtpProvider(cfg(base)).send('5511999998888', '000000'),
      ).rejects.toThrow(/HTTP 400/);
    });
  });
});
