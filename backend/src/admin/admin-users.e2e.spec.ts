import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { io as ioClient, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';
import { resetDb } from '../test-utils/reset-db';

/**
 * Admin user management — reject applications, block (temp/perm), unblock,
 * and enforcement (blocked users can't log in or join over sockets).
 */
describe('Admin user management (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let prisma: PrismaClient;
  let url: string;
  const sockets: Socket[] = [];
  let counter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    jwt = app.get(JwtService);
    prisma = new PrismaClient();
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  const server = () => app.getHttpServer();

  async function makeUser(
    role: 'PLAYER' | 'ADMIN',
    status: 'PENDING' | 'ACTIVE' = 'ACTIVE',
    cpf?: string,
  ) {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        phone: `+5511977700${counter.toString().padStart(3, '0')}`,
        displayName: role,
        cpf: cpf ?? `7770000000${counter.toString().padStart(2, '0')}`,
        birthDate: new Date('1990-01-01'),
        role,
        status,
      },
    });
    const token = await jwt.signAsync({ sub: user.id, phone: user.phone });
    return { ...user, token };
  }

  it('rejects a PENDING application and frees the phone/CPF', async () => {
    const admin = await makeUser('ADMIN');
    // Valid CPF so re-registration through the HTTP endpoint passes the check digits.
    const applicant = await makeUser('PLAYER', 'PENDING', '11144477735');

    await request(server())
      .post(`/admin/users/${applicant.id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(201);

    // User is gone → phone + CPF are free to register again.
    expect(await prisma.user.findUnique({ where: { id: applicant.id } })).toBeNull();
    const reused = await request(server())
      .post('/auth/register')
      .send({ phone: applicant.phone, displayName: 'New', cpf: '111.444.777-35', birthDate: '1990-01-01' })
      .expect(201);
    expect(reused.body.phone).toBe(applicant.phone);
  });

  it('refuses to reject a non-pending (active) user', async () => {
    const admin = await makeUser('ADMIN');
    const active = await makeUser('PLAYER', 'ACTIVE');
    await request(server())
      .post(`/admin/users/${active.id}/reject`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(400);
  });

  it('permanently blocks a user — they cannot log in', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');

    await request(server())
      .post(`/admin/users/${player.id}/block`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'fraude' })
      .expect(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(row.status).toBe('BLOCKED');
    expect(row.blockReason).toBe('fraude');
    expect(row.blockedUntil).toBeNull(); // permanent

    // Login attempt is denied (OTP request ok, verify rejected).
    await request(server()).post('/auth/otp/request').send({ phone: player.phone }).expect(200);
    const provider = app.get((await import('../auth/otp/otp-provider')).DevOtpProvider);
    const code = provider.lastCodeFor(player.phone)!;
    await request(server()).post('/auth/otp/verify').send({ phone: player.phone, code }).expect(401);
  });

  it('temporary block carries an expiry + reason and shows in the player list', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    const until = Date.now() + 60 * 60 * 1000;

    await request(server())
      .post(`/admin/users/${player.id}/block`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'spam', untilMs: until })
      .expect(201);

    const players = await request(server())
      .get('/admin/players')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
    const seen = players.body.find((p: any) => p.id === player.id);
    expect(seen.blocked).toBe(true);
    expect(seen.blockReason).toBe('spam');
    expect(seen.blockedUntil).toBeTruthy();
  });

  it('unblocks a user — login works again', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER');
    await request(server()).post(`/admin/users/${player.id}/block`)
      .set('Authorization', `Bearer ${admin.token}`).send({ reason: 'x' }).expect(201);
    await request(server()).post(`/admin/users/${player.id}/unblock`)
      .set('Authorization', `Bearer ${admin.token}`).expect(201);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(row.status).toBe('ACTIVE');
    expect(row.blockReason).toBeNull();
  });

  it('blocks gameplay over sockets (blocked user cannot join a table)', async () => {
    const admin = await makeUser('ADMIN');
    const player = await makeUser('PLAYER'); // token issued while active
    await request(server()).post(`/admin/users/${player.id}/block`)
      .set('Authorization', `Bearer ${admin.token}`).send({ reason: 'mid-session' }).expect(201);

    const socket = ioClient(url, { auth: { token: player.token }, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on('connected', () => resolve());
      socket.on('connect_error', reject);
    });
    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) =>
      socket.emit('table:join', { tableId: 'blk', maxSeats: 2 }, resolve));
    expect(ack.ok).toBe(false);
    expect(ack.error).toMatch(/bloqueada/i);
  });

  it('non-admins are forbidden from these endpoints (403)', async () => {
    const player = await makeUser('PLAYER');
    const victim = await makeUser('PLAYER');
    await request(server()).post(`/admin/users/${victim.id}/block`)
      .set('Authorization', `Bearer ${player.token}`).send({ reason: 'x' }).expect(403);
  });
});
