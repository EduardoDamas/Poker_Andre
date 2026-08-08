import { WhatsAppAdminNotifier } from './whatsapp-notifier';

describe('WhatsAppAdminNotifier', () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
    jest.restoreAllMocks();
  });

  function configure(): void {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456';
    process.env.WHATSAPP_TOKEN = 'tok';
    process.env.WHATSAPP_TO = '5513996001429';
  }

  it('reports configured only when all env vars are present', () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_TO;
    expect(WhatsAppAdminNotifier.isConfigured()).toBe(false);
    configure();
    expect(WhatsAppAdminNotifier.isConfigured()).toBe(true);
  });

  it('POSTs a WhatsApp text message when configured', async () => {
    configure();
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await new WhatsAppAdminNotifier().send('Prêmio de torneio');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123456/messages');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '5513996001429',
      type: 'text',
      text: { body: 'Prêmio de torneio' },
    });
  });

  it('no-ops (no HTTP) when unconfigured', async () => {
    delete process.env.WHATSAPP_TOKEN;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'));
    await new WhatsAppAdminNotifier().send('x');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx response so the caller can swallow it', async () => {
    configure();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('bad', { status: 401 }));
    await expect(new WhatsAppAdminNotifier().send('x')).rejects.toThrow(/401/);
  });
});
