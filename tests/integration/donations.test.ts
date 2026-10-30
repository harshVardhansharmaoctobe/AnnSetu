import { describe, expect, it } from 'vitest';
import { donationBody, signedIn, workflow } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();
const HOUR = 3_600_000;

describe('donations', () => {
  it('creates a donation with server-controlled status and remaining quantity', async () => {
    const { client, user } = await signedIn('DONOR');
    const res = await client.post('/api/donations', donationBody({ quantity: 12 }));
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ status: 'AVAILABLE', quantity: 12, remainingQuantity: 12 });
    const audit = await prisma.auditLog.count({ where: { userId: user.id, action: 'DONATION_CREATED', entityId: res.data.id } });
    expect(audit).toBe(1);
  });

  it('requires a completed donor profile', async () => {
    const { client } = await signedIn('DONOR', 'APPROVED', { profile: false });
    const res = await client.post('/api/donations', donationBody());
    expect(res.status).toBe(409);
    expect(res.data.code).toBe('PROFILE_INCOMPLETE');
  });

  it.each([
    ['missing food name', { foodName: undefined }, 'foodName'],
    ['zero quantity', { quantity: 0 }, 'quantity'],
    ['negative quantity', { quantity: -3 }, 'quantity'],
    ['deadline in the past', { safePickupDeadline: new Date(Date.now() - HOUR).toISOString() }, 'safePickupDeadline'],
    ['deadline more than 7 days out', { safePickupDeadline: new Date(Date.now() + 8 * 24 * HOUR).toISOString() }, 'safePickupDeadline'],
    ['preparation in the future', { preparationTime: new Date(Date.now() + 2 * HOUR).toISOString() }, 'preparationTime'],
    ['no safety declaration', { foodSafetyDeclared: false }, 'foodSafetyDeclared'],
    ['external photo URL', { photoUrl: 'https://evil.example/a.png' }, 'photoUrl'],
  ])('rejects %s', async (_label, override, field) => {
    const { client } = await signedIn('DONOR');
    const res = await client.post('/api/donations', donationBody(override));
    expect(res.status).toBe(400);
    expect(res.data.details.fieldErrors[field]).toBeDefined();
  });

  it('rejects client-set status, remaining quantity and owner', async () => {
    const { client } = await signedIn('DONOR');
    for (const extra of [{ status: 'COMPLETED' }, { remainingQuantity: 999 }, { donorProfileId: 'other' }]) {
      expect((await client.post('/api/donations', donationBody(extra))).status).toBe(400);
    }
  });

  it('can be edited while it has no requests, and quantity edits reset availability', async () => {
    const { client } = await signedIn('DONOR');
    const d = (await client.post('/api/donations', donationBody({ quantity: 10 }))).data;
    const res = await client.patch(`/api/donations/${d.id}`, { foodName: 'Updated paneer curry', quantity: 15 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ foodName: 'Updated paneer curry', quantity: 15, remainingQuantity: 15 });
    expect((await client.patch(`/api/donations/${d.id}`, { status: 'COMPLETED' })).status).toBe(400);
  });

  it('cannot be edited once an NGO has requested it', async () => {
    const flow = await workflow('requested');
    const res = await flow.donor.client.patch(`/api/donations/${flow.donation.id}`, { quantity: 50 });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe('INVALID_TRANSITION');
  });

  it('cancelling closes pending/approved requests and notifies the NGO', async () => {
    const flow = await workflow('approved');
    const res = await flow.donor.client.post(`/api/donations/${flow.donation.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('CANCELLED');
    const req = await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } });
    expect(req.status).toBe('CANCELLED');
    expect(await prisma.notification.count({ where: { userId: flow.ngo.user.id, type: 'DONATION_CANCELLED' } })).toBe(1);
    expect((await flow.donor.client.post(`/api/donations/${flow.donation.id}/cancel`)).status).toBe(409);
  });

  it('cannot be cancelled once food is on its way', async () => {
    const flow = await workflow('picked');
    const res = await flow.donor.client.post(`/api/donations/${flow.donation.id}/cancel`);
    expect(res.status).toBe(409);
  });

  it('expired donations disappear from discovery and cannot be requested', async () => {
    const { client } = await signedIn('DONOR');
    const ngo = await signedIn('NGO');
    const d = (await client.post('/api/donations', donationBody())).data;
    await prisma.foodDonation.update({ where: { id: d.id }, data: { safePickupDeadline: new Date(Date.now() - 60_000) } });

    const list = await ngo.client.get('/api/donations?scope=available&pageSize=50');
    expect(list.data.items.some((x: { id: string }) => x.id === d.id)).toBe(false);
    expect((await prisma.foodDonation.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('EXPIRED');
    const res = await ngo.client.post('/api/requests', { donationId: d.id, requestedQuantity: 1 });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe('DONATION_UNAVAILABLE');
  });

  it('discovery filters by category and reports real distances from the NGO', async () => {
    const donor = await signedIn('DONOR');
    const ngo = await signedIn('NGO');
    const d = (await donor.client.post('/api/donations', donationBody({ foodCategory: 'DAIRY', foodName: 'Paneer blocks' }))).data;
    const res = await ngo.client.get('/api/donations?scope=available&category=DAIRY&sort=nearest&pageSize=50');
    const row = res.data.items.find((x: { id: string }) => x.id === d.id);
    expect(row).toBeDefined();
    expect(res.data.items.every((x: { foodCategory: string }) => x.foodCategory === 'DAIRY')).toBe(true);
    expect(row.distanceKm).toBeGreaterThan(2); // NGO fixture is ~3 km away
    expect(row.distanceKm).toBeLessThan(4);
    expect(res.data.origin.source).toBe('profile');
    const none = await ngo.client.get('/api/donations?scope=available&category=DAIRY&radiusKm=1&pageSize=50');
    expect(none.data.items.some((x: { id: string }) => x.id === d.id)).toBe(false);
  });

  it("hides donations from donors who are not approved", async () => {
    const donor = await signedIn('DONOR');
    const ngo = await signedIn('NGO');
    const d = (await donor.client.post('/api/donations', donationBody())).data;
    await prisma.user.update({ where: { id: donor.user.id }, data: { accountStatus: 'SUSPENDED' } });
    const list = await ngo.client.get('/api/donations?scope=available&pageSize=50');
    expect(list.data.items.some((x: { id: string }) => x.id === d.id)).toBe(false);
    expect((await ngo.client.get(`/api/donations/${d.id}`)).status).toBe(404);
  });
});
