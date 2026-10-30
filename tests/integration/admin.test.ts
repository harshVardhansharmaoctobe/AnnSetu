import { describe, expect, it } from 'vitest';
import { Client } from '../support/http';
import { createUser, PASSWORD, signedIn, workflow } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();

describe('admin account management', () => {
  it('approves a pending user, notifies them and writes an audit entry', async () => {
    const admin = await signedIn('ADMIN');
    const user = await createUser('NGO', 'PENDING');
    const res = await admin.client.post(`/api/admin/users/${user.id}`, { action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.data.accountStatus).toBe('APPROVED');
    expect('password' in res.data).toBe(false);
    expect(await prisma.notification.count({ where: { userId: user.id, type: 'ACCOUNT_APPROVED' } })).toBe(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: 'ACCOUNT_APPROVED' } });
    expect(log.userId).toBe(admin.user.id);
    expect(log.details).toContain('PENDING → APPROVED');
  });

  it('rejects, suspends and reinstates with explicit transitions', async () => {
    const admin = await signedIn('ADMIN');
    const a = await createUser('DONOR', 'PENDING');
    expect((await admin.client.post(`/api/admin/users/${a.id}`, { action: 'reject', reason: 'Incomplete documents' })).data.accountStatus).toBe('REJECTED');
    expect((await admin.client.post(`/api/admin/users/${a.id}`, { action: 'reject' })).status).toBe(409);
    expect((await admin.client.post(`/api/admin/users/${a.id}`, { action: 'approve' })).data.accountStatus).toBe('APPROVED');

    expect((await admin.client.post(`/api/admin/users/${a.id}`, { action: 'suspend' })).data.accountStatus).toBe('SUSPENDED');
    expect((await new Client().login(a.email, PASSWORD)).error).toContain('suspended');
    expect((await admin.client.post(`/api/admin/users/${a.id}`, { action: 'approve' })).status).toBe(409);
    expect((await admin.client.post(`/api/admin/users/${a.id}`, { action: 'reinstate' })).data.accountStatus).toBe('APPROVED');
    expect((await new Client().login(a.email, PASSWORD)).error).toBeNull();

    const actions = await prisma.auditLog.findMany({ where: { entityId: a.id, entity: 'User' }, orderBy: { createdAt: 'asc' }, select: { action: true } });
    expect(actions.map((x) => x.action)).toEqual(['ACCOUNT_REJECTED', 'ACCOUNT_APPROVED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_APPROVED']);
  });

  it('admins cannot change their own status or another admin', async () => {
    const admin = await signedIn('ADMIN');
    const other = await createUser('ADMIN');
    expect((await admin.client.post(`/api/admin/users/${admin.user.id}`, { action: 'suspend' })).data.code).toBe('SELF_ACTION');
    expect((await admin.client.post(`/api/admin/users/${other.id}`, { action: 'suspend' })).data.code).toBe('ADMIN_TARGET');
  });

  it('validates the action and target', async () => {
    const admin = await signedIn('ADMIN');
    const user = await createUser('DONOR', 'PENDING');
    expect((await admin.client.post(`/api/admin/users/${user.id}`, { action: 'promote' })).status).toBe(400);
    expect((await admin.client.post(`/api/admin/users/${user.id}`, { action: 'approve', role: 'ADMIN' })).status).toBe(400);
    expect((await admin.client.post('/api/admin/users/does-not-exist', { action: 'approve' })).status).toBe(404);
  });

  it("suspending a volunteer releases deliveries they have not picked up", async () => {
    const admin = await signedIn('ADMIN');
    const flow = await workflow('assigned');
    await admin.client.post(`/api/admin/users/${flow.volunteer!.user.id}`, { action: 'suspend' });
    expect((await prisma.volunteerAssignment.findUniqueOrThrow({ where: { id: flow.assignment.id } })).status).toBe('CANCELLED');
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).status).toBe('ACCEPTED');
  });

  it('lists and filters users without exposing password hashes', async () => {
    const admin = await signedIn('ADMIN');
    const user = await createUser('VOLUNTEER', 'PENDING', { label: 'findme' });
    const res = await admin.client.get(`/api/admin/users?q=${encodeURIComponent(user.email)}&role=VOLUNTEER&status=PENDING`);
    expect(res.data.items.map((u: { id: string }) => u.id)).toEqual([user.id]);
    expect(JSON.stringify(res.data)).not.toContain('$2');
    expect((await admin.client.get('/api/admin/users?pageSize=500')).status).toBe(400); // bounded page size
  });

  it('platform map returns stored locations of approved participants only', async () => {
    const admin = await signedIn('ADMIN');
    const flow = await workflow('assigned');
    const pendingNgo = await createUser('NGO', 'PENDING');
    const res = await admin.client.get('/api/admin/map');
    expect(res.status).toBe(200);
    expect(res.data.ngos.some((n: { id: string }) => n.id === flow.ngo.user.profileId)).toBe(true);
    expect(res.data.ngos.some((n: { id: string }) => n.id === pendingNgo.profileId)).toBe(false);
    expect(res.data.deliveries.some((d: { id: string }) => d.id === flow.request.id)).toBe(true);
    for (const p of [...res.data.donors, ...res.data.ngos]) expect(typeof p.latitude).toBe('number');
    expect(JSON.stringify(res.data)).not.toMatch(/email|password|phone/i);
    expect((await flow.ngo.client.get('/api/admin/map')).status).toBe(403);
  });

  it('provides stats and a searchable audit log', async () => {
    const admin = await signedIn('ADMIN');
    const stats = await admin.client.get('/api/admin/stats');
    expect(stats.status).toBe(200);
    expect(stats.data.users.total).toBeGreaterThan(0);
    expect(stats.data.impact.scope).toBe('platform');
    const audit = await admin.client.get('/api/admin/audit?q=ACCOUNT');
    expect(audit.status).toBe(200);
    expect(audit.data.items.length).toBeGreaterThan(0);
  });
});
