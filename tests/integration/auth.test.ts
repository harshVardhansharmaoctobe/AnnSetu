import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Client } from '../support/http';
import { createUser, PASSWORD, signedIn, uniqueEmail } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();
const reg = (extra: Record<string, unknown>) => ({ name: 'Reg Test', password: PASSWORD, confirmPassword: PASSWORD, ...extra });

describe('test isolation', () => {
  it('server under test uses the _test database, not the dev database', async () => {
    const user = await createUser('DONOR');
    const { error } = await new Client().login(user.email, PASSWORD); // only succeeds if the server reads the test DB
    expect(error).toBeNull();
    const dev = new PrismaClient(); // DATABASE_URL from .env = dev database
    try {
      expect(await dev.user.count({ where: { email: user.email } })).toBe(0);
    } finally {
      await dev.$disconnect();
    }
  });
});

describe('login policy per account status', () => {
  it.each([['APPROVED'], ['PENDING'], ['REJECTED']] as const)('%s accounts can sign in and see their status', async (status) => {
    const user = await createUser('DONOR', status);
    const { error, session } = await new Client().login(user.email, PASSWORD);
    expect(error).toBeNull();
    expect(session.user.accountStatus).toBe(status);
    expect(session.user.id).toBe(user.id);
  });

  it('SUSPENDED accounts cannot sign in and get a clear message', async () => {
    const user = await createUser('VOLUNTEER', 'SUSPENDED');
    const { error, session } = await new Client().login(user.email, PASSWORD);
    expect(error).toBe('This account has been suspended. Contact the FoodBridge team.');
    expect(session.user).toBeUndefined();
  });

  it('wrong password and unknown email return the same generic error', async () => {
    const suspended = await createUser('VOLUNTEER', 'SUSPENDED');
    expect((await new Client().login(suspended.email, 'WrongPass999')).error).toBe('Invalid email or password');
    expect((await new Client().login(uniqueEmail('nobody'), PASSWORD)).error).toBe('Invalid email or password');
  });

  it('email is case- and whitespace-insensitive', async () => {
    const user = await createUser('NGO');
    const { error, session } = await new Client().login(`  ${user.email.toUpperCase()} `, PASSWORD);
    expect(error).toBeNull();
    expect(session.user.email).toBe(user.email);
  });

  it('locks an email after 5 failed attempts, even for the correct password', async () => {
    const user = await createUser('DONOR');
    for (let i = 0; i < 5; i++) {
      expect((await new Client().login(user.email, `wrong-${i}-pass`)).error).toBe('Invalid email or password');
    }
    const { error } = await new Client().login(user.email, PASSWORD);
    expect(error).toBe('Too many failed sign-in attempts. Please wait 15 minutes and try again.');
  });

  it('logout clears the session', async () => {
    const { client } = await signedIn('DONOR');
    const csrf = await client.get('/api/auth/csrf');
    await client.req('POST', '/api/auth/signout', { form: { csrfToken: csrf.data.csrfToken } });
    expect((await client.get('/api/auth/session')).data).toEqual({});
    expect((await client.get('/api/profile')).status).toBe(401);
  });
});

describe('registration', () => {
  it('rejects public ADMIN registration and creates nothing', async () => {
    const email = uniqueEmail('wannabe.admin');
    const res = await new Client().post('/api/register', reg({ email, role: 'ADMIN' }));
    expect(res.status).toBe(400);
    expect(res.data.details.role).toBeDefined();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('ignores client-supplied status/id: new accounts are PENDING with a normalised email', async () => {
    const email = uniqueEmail('Sneaky.User');
    const res = await new Client().post('/api/register', reg({ email: email.toUpperCase(), role: 'DONOR', accountStatus: 'APPROVED', id: 'hijack' }));
    expect(res.status).toBe(201);
    const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    expect(row).toMatchObject({ accountStatus: 'PENDING', role: 'DONOR' });
    expect(row!.id).not.toBe('hijack');
    expect(row!.password).not.toBe(PASSWORD); // stored as a bcrypt hash
    expect(row!.password.startsWith('$2')).toBe(true);
    expect(JSON.stringify(res.data)).not.toContain('password');
  });

  it('rejects duplicate emails regardless of case, and invalid JSON', async () => {
    const email = uniqueEmail('dup');
    expect((await new Client().post('/api/register', reg({ email, role: 'NGO' }))).status).toBe(201);
    expect((await new Client().post('/api/register', reg({ email: email.toUpperCase(), role: 'NGO' }))).status).toBe(409);
    expect((await new Client().req('POST', '/api/register', { raw: '{not json' })).status).toBe(400);
  });

  it('creates a volunteer profile and notifies the user and admins', async () => {
    const admin = await createUser('ADMIN');
    const email = uniqueEmail('newvol');
    await new Client().post('/api/register', reg({ email, role: 'VOLUNTEER' }));
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { volunteerProfile: true, notifications: true } });
    expect(user.volunteerProfile).not.toBeNull();
    expect(user.notifications.map((n) => n.type)).toContain('REGISTRATION_SUBMITTED');
    expect(await prisma.notification.count({ where: { userId: admin.id, message: { contains: 'registered as volunteer' } } })).toBeGreaterThan(0);
  });
});

describe('profile API', () => {
  const donorProfile = { organisationName: 'Test Kitchen', organisationType: 'restaurant', address: '1 Test Street, Jaipur', latitude: 26.9, longitude: 75.8 };

  it('requires a session', async () => {
    expect((await new Client().get('/api/profile')).status).toBe(401);
    expect((await new Client().put('/api/profile', { name: 'x y' })).status).toBe(401);
  });

  it('never returns the password hash', async () => {
    const { client, user } = await signedIn('DONOR');
    const res = await client.get('/api/profile');
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(user.id);
    expect('password' in res.data).toBe(false);
  });

  it('PENDING users may complete their profile; REJECTED users are read-only', async () => {
    const pending = await signedIn('DONOR', 'PENDING', { profile: false });
    expect((await pending.client.put('/api/profile', { donorProfile })).status).toBe(200);
    const rejected = await signedIn('NGO', 'REJECTED');
    expect((await rejected.client.get('/api/profile')).status).toBe(200);
    const res = await rejected.client.put('/api/profile', { name: 'Rejected Edit' });
    expect(res.status).toBe(403);
    expect(res.data.code).toBe('ACCOUNT_REJECTED');
  });

  it.each([
    ['role', { role: 'ADMIN' }],
    ['accountStatus', { accountStatus: 'APPROVED' }],
    ['id', { id: 'forged' }],
    ['userId', { userId: 'forged' }],
    ['nested donorProfile.userId', { donorProfile: { ...donorProfile, userId: 'forged' } }],
    ['nested donorProfile.id', { donorProfile: { ...donorProfile, id: 'forged' } }],
  ])('rejects tampering with %s', async (_label, body) => {
    const { client, user } = await signedIn('DONOR');
    expect((await client.put('/api/profile', { name: 'Hacker', ...body })).status).toBe(400);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ role: 'DONOR', accountStatus: 'APPROVED' });
    expect(row.name).not.toBe('Hacker');
  });

  it("only writes the caller's own, role-matching profile", async () => {
    const a = await signedIn('DONOR', 'APPROVED', { profile: false });
    const b = await createUser('DONOR');
    expect((await a.client.put('/api/profile', { donorProfile })).status).toBe(200);
    expect((await prisma.donorProfile.findUniqueOrThrow({ where: { userId: a.user.id } })).organisationName).toBe('Test Kitchen');
    expect((await prisma.donorProfile.findUniqueOrThrow({ where: { userId: b.id } })).organisationName).not.toBe('Test Kitchen');
    const res = await a.client.put('/api/profile', { ngoProfile: { ...donorProfile, receivingCapacity: 10, organisationType: undefined } });
    expect(res.status).toBe(400);
  });
});

describe('session revocation (no stale JWT permissions)', () => {
  it('suspending a user revokes their existing session immediately', async () => {
    const { client, user } = await signedIn('NGO');
    expect((await client.get('/api/profile')).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { accountStatus: 'SUSPENDED' } });
    expect((await client.get('/api/profile')).status).toBe(401);
    expect((await client.get('/api/auth/session')).data).toEqual({});
    expect(client.cookieNames.some((k) => k.includes('session-token'))).toBe(false);
  });

  it('rejecting a user mid-session blocks protected actions at once', async () => {
    const { client, user } = await signedIn('VOLUNTEER');
    expect((await client.put('/api/profile', { volunteerProfile: { vehicleType: 'bike' } })).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { accountStatus: 'REJECTED' } });
    expect((await client.put('/api/profile', { volunteerProfile: { vehicleType: 'car' } })).status).toBe(403);
    expect((await client.get('/api/auth/session')).data.user.accountStatus).toBe('REJECTED');
  });

  it('role changes apply to the next request', async () => {
    const { client, user } = await signedIn('DONOR');
    await prisma.user.update({ where: { id: user.id }, data: { role: 'NGO' } });
    expect((await client.get('/api/donations?scope=mine')).status).toBe(403);
    await prisma.user.update({ where: { id: user.id }, data: { role: 'DONOR' } });
  });

  it('deleting a user invalidates their session', async () => {
    const { client, user } = await signedIn('VOLUNTEER');
    await prisma.user.delete({ where: { id: user.id } });
    expect((await client.get('/api/profile')).status).toBe(401);
  });
});

describe('platform', () => {
  it('health endpoint reports the database without leaking configuration', async () => {
    const res = await new Client().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ status: 'ok', database: 'up' });
  });

  it('pages carry security headers and no x-powered-by', async () => {
    const res = await new Client().get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('protected pages redirect anonymous visitors to login', async () => {
    const res = await new Client().get('/dashboard/admin');
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.location).toContain('/login');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
