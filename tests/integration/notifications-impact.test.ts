import { describe, expect, it } from 'vitest';
import { Client } from '../support/http';
import { signedIn, workflow } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();

describe('notifications', () => {
  it('are delivered only to the right recipients across the lifecycle', async () => {
    const flow = await workflow('delivered');
    const types = async (userId: string) =>
      (await prisma.notification.findMany({ where: { userId }, select: { type: true } })).map((n) => n.type).sort();
    expect(await types(flow.donor.user.id)).toEqual(['DELIVERY_COMPLETED', 'NEW_REQUEST', 'PICKUP_COMPLETED', 'VOLUNTEER_ASSIGNED']);
    expect(await types(flow.ngo.user.id)).toEqual(['DELIVERY_COMPLETED', 'PICKUP_COMPLETED', 'REQUEST_APPROVED', 'VOLUNTEER_ASSIGNED']);
    expect(await types(flow.volunteer!.user.id)).toEqual([]); // self-claimed: no "please accept" notice
  });

  it('lists own notifications, counts unread, and marks one or all as read', async () => {
    const flow = await workflow('approved');
    const ngo = flow.ngo.client;
    const list = await ngo.get('/api/notifications');
    expect(list.data.total).toBe(1);
    expect((await ngo.get('/api/notifications/count')).data.unread).toBe(1);

    expect((await ngo.post('/api/notifications/read', { id: list.data.items[0].id })).data.updated).toBe(1);
    expect((await ngo.get('/api/notifications/count')).data.unread).toBe(0);
    expect((await ngo.get('/api/notifications?unreadOnly=true')).data.total).toBe(0);

    const donor = flow.donor.client;
    expect((await donor.get('/api/notifications/count')).data.unread).toBeGreaterThan(0);
    await donor.post('/api/notifications/read', { all: true });
    expect((await donor.get('/api/notifications/count')).data.unread).toBe(0);
  });

  it("cannot read or mark another user's notification", async () => {
    const flow = await workflow('requested');
    const donorNote = await prisma.notification.findFirstOrThrow({ where: { userId: flow.donor.user.id } });
    const res = await flow.ngo.client.post('/api/notifications/read', { id: donorNote.id });
    expect(res.status).toBe(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: donorNote.id } })).isRead).toBe(false);
    const ngoList = await flow.ngo.client.get('/api/notifications');
    expect(ngoList.data.items.some((n: { id: string }) => n.id === donorNote.id)).toBe(false);
  });

  it('pending users can read their registration notifications', async () => {
    const { client } = await signedIn('DONOR', 'PENDING');
    expect((await client.get('/api/notifications')).status).toBe(200);
  });
});

describe('impact aggregation', () => {
  it('counts only verified deliveries; unconfirmed ones are reported separately', async () => {
    const before = (await new Client().get('/api/impact')).data;
    const flow = await workflow('delivered', { quantity: 25 });
    const mid = (await new Client().get('/api/impact')).data;
    expect(mid.donations.total).toBe(before.donations.total + 1);
    expect(mid.donations.quantityListed.MEALS).toBe(before.donations.quantityListed.MEALS + 25);
    expect(mid.deliveries.awaitingConfirmation).toBe(before.deliveries.awaitingConfirmation + 1);
    expect(mid.deliveries.quantityAwaitingConfirmation.MEALS).toBe(before.deliveries.quantityAwaitingConfirmation.MEALS + 25);
    // Not confirmed yet: nothing changes in the verified figures or estimates.
    expect(mid.deliveries.completed).toBe(before.deliveries.completed);
    expect(mid.deliveries.quantityVerified.MEALS).toBe(before.deliveries.quantityVerified.MEALS);
    expect(mid.estimates.mealsServed).toBe(before.estimates.mealsServed);

    await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'CONFIRMED' });
    const after = (await new Client().get('/api/impact')).data;
    expect(after.deliveries.completed).toBe(before.deliveries.completed + 1);
    expect(after.deliveries.quantityVerified.MEALS).toBe(before.deliveries.quantityVerified.MEALS + 25);
    expect(after.deliveries.awaitingConfirmation).toBe(before.deliveries.awaitingConfirmation);
    expect(after.donations.completed).toBe(before.donations.completed + 1);
    expect(after.participants.volunteerVerifiedDeliveries).toBe(before.participants.volunteerVerifiedDeliveries + 1);
    expect(after.deliveries.recoveryRatePercent.MEALS).toBeGreaterThan(0);
    expect(after.estimates.mealsServed).toBeCloseTo(before.estimates.mealsServed + 25, 2);
    expect(after.estimates.foodWastePreventedKg).toBeCloseTo(before.estimates.foodWastePreventedKg + 10, 2);
    expect(after.estimates.co2SavedKg).toBeCloseTo(before.estimates.co2SavedKg + 25, 2);
    expect(after.participants.activeVolunteers).toBeGreaterThanOrEqual(1);
  });

  it("personal impact is scoped to the caller's own records", async () => {
    const flow = await workflow('delivered', { quantity: 5 });
    await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'CONFIRMED' });
    const donor = (await flow.donor.client.get('/api/impact?scope=me')).data;
    expect(donor).toMatchObject({ scope: 'donor', donations: { total: 1 }, deliveries: { completed: 1 } });
    expect(donor.estimates.mealsServed).toBe(5);
    const vol = (await flow.volunteer!.client.get('/api/impact?scope=me')).data;
    expect(vol.scope).toBe('volunteer');
    expect(vol.estimates.confirmedDeliveries).toBe(1);
    const stranger = await signedIn('DONOR');
    expect((await stranger.client.get('/api/impact?scope=me')).data.donations.total).toBe(0);
  });

  it('reports the share of figures that comes from demo accounts', async () => {
    const before = (await new Client().get('/api/impact')).data;
    const real = await workflow('delivered', { quantity: 4 });
    await real.ngo.client.post(`/api/requests/${real.request.id}/confirm`, { outcome: 'CONFIRMED' });
    const mid = (await new Client().get('/api/impact')).data;
    expect(mid.demo.donations).toBe(before.demo.donations); // a real donor's records are not demo
    expect(mid.demo.verifiedDeliveries).toBe(before.demo.verifiedDeliveries);

    const demo = await workflow('delivered', { quantity: 6, demoDonor: true });
    await demo.ngo.client.post(`/api/requests/${demo.request.id}/confirm`, { outcome: 'CONFIRMED' });
    const after = (await new Client().get('/api/impact')).data;
    expect(after.demo.donations).toBe(before.demo.donations + 1);
    expect(after.demo.verifiedDeliveries).toBe(before.demo.verifiedDeliveries + 1);
    expect(after.demo.mealsServed).toBeCloseTo(before.demo.mealsServed + 6, 2);
    expect(after.deliveries.completed).toBe(before.deliveries.completed + 2); // demo is included in, not added to, totals
  });

  it('the public endpoint exposes aggregates only', async () => {
    const res = await new Client().get('/api/impact');
    const body = JSON.stringify(res.data);
    expect(res.status).toBe(200);
    expect(body).not.toMatch(/@fbtest\.invalid|password|email/i);
  });
});
