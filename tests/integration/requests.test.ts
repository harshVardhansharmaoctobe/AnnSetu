import { describe, expect, it } from 'vitest';
import { donationBody, signedIn, workflow } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();

describe('food requests', () => {
  it('an NGO can request available food and the donor is notified', async () => {
    const flow = await workflow('requested', { quantity: 6 });
    expect(flow.request).toMatchObject({ status: 'PENDING', requestedQuantity: 6 });
    expect(await prisma.notification.count({ where: { userId: flow.donor.user.id, type: 'NEW_REQUEST' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: flow.ngo.user.id, type: 'NEW_REQUEST' } })).toBe(0);
  });

  it('rejects a duplicate request from the same NGO', async () => {
    const flow = await workflow('requested', { quantity: 4 });
    const res = await flow.ngo.client.post('/api/requests', { donationId: flow.donation.id, requestedQuantity: 1 });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe('DUPLICATE_REQUEST');
  });

  it('allows re-requesting after the NGO cancelled, by reactivating the same row', async () => {
    const flow = await workflow('requested', { quantity: 4 });
    await flow.ngo.client.post(`/api/requests/${flow.request.id}/cancel`, {});
    const res = await flow.ngo.client.post('/api/requests', { donationId: flow.donation.id, requestedQuantity: 2 });
    expect(res.status).toBe(201);
    expect(res.data.id).toBe(flow.request.id);
    expect(res.data.status).toBe('PENDING');
  });

  it('rejects quantities above what remains, and non-positive quantities', async () => {
    const donor = await signedIn('DONOR');
    const ngo = await signedIn('NGO');
    const d = (await donor.client.post('/api/donations', donationBody({ quantity: 5 }))).data;
    const over = await ngo.client.post('/api/requests', { donationId: d.id, requestedQuantity: 6 });
    expect(over.status).toBe(400);
    expect(over.data.code).toBe('QUANTITY_EXCEEDS_AVAILABLE');
    expect((await ngo.client.post('/api/requests', { donationId: d.id, requestedQuantity: 0 })).status).toBe(400);
    expect((await ngo.client.post('/api/requests', { donationId: d.id, requestedQuantity: -2 })).status).toBe(400);
  });

  it('requires a completed NGO profile', async () => {
    const donor = await signedIn('DONOR');
    const ngo = await signedIn('NGO', 'APPROVED', { profile: false });
    const d = (await donor.client.post('/api/donations', donationBody())).data;
    const res = await ngo.client.post('/api/requests', { donationId: d.id, requestedQuantity: 1 });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe('PROFILE_INCOMPLETE');
  });

  it('approval reserves quantity and updates donation status', async () => {
    const donor = await signedIn('DONOR');
    const ngo = await signedIn('NGO');
    const d = (await donor.client.post('/api/donations', donationBody({ quantity: 10 }))).data;
    const r = (await ngo.client.post('/api/requests', { donationId: d.id, requestedQuantity: 4 })).data;
    const res = await donor.client.post(`/api/requests/${r.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ACCEPTED');
    expect(await prisma.foodDonation.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ remainingQuantity: 6, status: 'PARTIALLY_RESERVED' });
    expect(await prisma.notification.count({ where: { userId: ngo.user.id, type: 'REQUEST_APPROVED' } })).toBe(1);
  });

  it('rejection notifies the NGO with the reason and reserves nothing', async () => {
    const flow = await workflow('requested', { quantity: 3 });
    const res = await flow.donor.client.post(`/api/requests/${flow.request.id}/reject`, { reason: 'Already promised' });
    expect(res.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Already promised' });
    expect((await prisma.foodDonation.findUniqueOrThrow({ where: { id: flow.donation.id } })).remainingQuantity).toBe(3);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: flow.ngo.user.id, type: 'REQUEST_REJECTED' } });
    expect(n.message).toContain('Already promised');
  });

  it('rejects invalid transitions', async () => {
    const flow = await workflow('requested');
    await flow.donor.client.post(`/api/requests/${flow.request.id}/reject`, {});
    expect((await flow.donor.client.post(`/api/requests/${flow.request.id}/approve`)).status).toBe(409);
    expect((await flow.donor.client.post(`/api/requests/${flow.request.id}/reject`, {})).status).toBe(409);
    expect((await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'CONFIRMED' })).status).toBe(409);
    const picked = await workflow('picked');
    expect((await picked.ngo.client.post(`/api/requests/${picked.request.id}/cancel`, {})).status).toBe(409);
  });

  it('cancelling an approved request releases the reserved quantity', async () => {
    const flow = await workflow('approved', { quantity: 5 });
    expect((await prisma.foodDonation.findUniqueOrThrow({ where: { id: flow.donation.id } })).remainingQuantity).toBe(0);
    await flow.ngo.client.post(`/api/requests/${flow.request.id}/cancel`, { reason: 'Plans changed' });
    expect(await prisma.foodDonation.findUniqueOrThrow({ where: { id: flow.donation.id } })).toMatchObject({ remainingQuantity: 5, status: 'AVAILABLE' });
  });
});

describe('concurrency', () => {
  it('two simultaneous approvals can never over-allocate the same food', async () => {
    const donor = await signedIn('DONOR');
    const ngoA = await signedIn('NGO');
    const ngoB = await signedIn('NGO');
    const d = (await donor.client.post('/api/donations', donationBody({ quantity: 10 }))).data;
    const a = (await ngoA.client.post('/api/requests', { donationId: d.id, requestedQuantity: 7 })).data;
    const b = (await ngoB.client.post('/api/requests', { donationId: d.id, requestedQuantity: 7 })).data;

    const results = await Promise.all([
      donor.client.post(`/api/requests/${a.id}/approve`),
      donor.client.post(`/api/requests/${b.id}/approve`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const donation = await prisma.foodDonation.findUniqueOrThrow({ where: { id: d.id } });
    expect(donation.remainingQuantity).toBe(3);
    const accepted = await prisma.foodRequest.count({ where: { donationId: d.id, status: 'ACCEPTED' } });
    expect(accepted).toBe(1);
  });

  it('many parallel approvals of one request succeed exactly once', async () => {
    const flow = await workflow('requested', { quantity: 2 });
    const results = await Promise.all(Array.from({ length: 5 }, () => flow.donor.client.post(`/api/requests/${flow.request.id}/approve`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await prisma.foodDonation.findUniqueOrThrow({ where: { id: flow.donation.id } })).remainingQuantity).toBe(0);
  });

  it('parallel duplicate requests create exactly one row', async () => {
    const donor = await signedIn('DONOR');
    const ngo = await signedIn('NGO');
    const d = (await donor.client.post('/api/donations', donationBody({ quantity: 10 }))).data;
    const results = await Promise.all(Array.from({ length: 4 }, () => ngo.client.post('/api/requests', { donationId: d.id, requestedQuantity: 1 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await prisma.foodRequest.count({ where: { donationId: d.id } })).toBe(1);
  });
});
