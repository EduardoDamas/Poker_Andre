import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';

/**
 * STEP D1 gate — Socket.IO handshake requires a valid JWT.
 */
describe('GameGateway auth (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0); // random free port
    jwt = app.get(JwtService);
    const port = (app.getHttpServer().address() as AddressInfo).port;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // Attempt a connection; resolve how it ended.
  function attempt(token?: string): Promise<{ ok: boolean; userId?: string }> {
    return new Promise((resolve) => {
      const socket: Socket = ioClient(url, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
        timeout: 2000,
      });
      let settled = false;
      const done = (r: { ok: boolean; userId?: string }) => {
        if (settled) return;
        settled = true;
        socket.close();
        resolve(r);
      };
      socket.on('connected', (data: { userId: string }) => done({ ok: true, userId: data.userId }));
      socket.on('unauthorized', () => done({ ok: false }));
      socket.on('disconnect', () => done({ ok: false }));
      socket.on('connect_error', () => done({ ok: false }));
      setTimeout(() => done({ ok: socket.connected }), 1500);
    });
  }

  it('accepts a connection with a valid JWT', async () => {
    const token = await jwt.signAsync({ sub: 'user-123', phone: '+5511990000000' });
    const res = await attempt(token);
    expect(res.ok).toBe(true);
    expect(res.userId).toBe('user-123');
  });

  it('rejects a connection with no token', async () => {
    const res = await attempt(undefined);
    expect(res.ok).toBe(false);
  });

  it('rejects a connection with a garbage token', async () => {
    const res = await attempt('not.a.valid.jwt');
    expect(res.ok).toBe(false);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forge = new JwtService({ secret: 'the-wrong-secret' });
    const bad = await forge.signAsync({ sub: 'attacker', phone: '+550000000000' });
    const res = await attempt(bad);
    expect(res.ok).toBe(false);
  });
});
