import { InfinitePayClient } from './infinitepay.client';

describe('InfinitePayClient', () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
    jest.restoreAllMocks();
  });

  it('is configured when the handle is set', () => {
    delete process.env.INFINITEPAY_HANDLE;
    expect(InfinitePayClient.isConfigured()).toBe(false);
    process.env.INFINITEPAY_HANDLE = 'andre-luiz-g4j';
    expect(InfinitePayClient.isConfigured()).toBe(true);
  });

  it('POSTs the documented payload and returns the checkout url', async () => {
    process.env.INFINITEPAY_HANDLE = 'andre-luiz-g4j';
    process.env.PUBLIC_BASE_URL = 'https://api.example.com';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ url: 'https://link.infinitepay.io/x' }), { status: 200 }));

    const link = await new InfinitePayClient().createCheckoutLink({
      orderNsu: 'SUB-abc-MONTHLY',
      amountCents: 20000,
      description: 'Assinatura Mensal',
    });

    expect(link).toEqual({ url: 'https://link.infinitepay.io/x', orderNsu: 'SUB-abc-MONTHLY' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.checkout.infinitepay.io/links');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      handle: 'andre-luiz-g4j',
      order_nsu: 'SUB-abc-MONTHLY',
      items: [{ description: 'Assinatura Mensal', price: 20000, quantity: 1 }],
      webhook_url: 'https://api.example.com/payments/webhook/infinitepay',
    });
  });

  it('throws when unconfigured', async () => {
    delete process.env.INFINITEPAY_HANDLE;
    await expect(
      new InfinitePayClient().createCheckoutLink({ orderNsu: 'x', amountCents: 1, description: 'x' }),
    ).rejects.toThrow(/not configured/);
  });

  it('throws on a non-2xx response', async () => {
    process.env.INFINITEPAY_HANDLE = 'h';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 400 }));
    await expect(
      new InfinitePayClient().createCheckoutLink({ orderNsu: 'x', amountCents: 1, description: 'x' }),
    ).rejects.toThrow(/400/);
  });
});
