import { describe, expect, it } from 'vitest';
import { PNG_BYTES } from '../support/http';
import { signedIn, workflow } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();

describe('volunteer assignments', () => {
  it('admin assigns, volunteer accepts; donor and NGO are notified', async () => {
    const flow = await workflow('approved');
    const admin = await signedIn('ADMIN');
    const vol = await signedIn('VOLUNTEER');
    const res = await admin.client.post('/api/assignments', { requestId: flow.request.id, volunteerProfileId: vol.user.profileId });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe('ASSIGNED');
    expect(await prisma.notification.count({ where: { userId: vol.user.id, type: 'VOLUNTEER_ASSIGNED' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: flow.ngo.user.id, type: 'VOLUNTEER_ASSIGNED' } })).toBe(1);

    expect((await vol.client.post(`/api/assignments/${res.data.id}/pickup`, {})).status).toBe(409); // must accept first
    const accepted = await vol.client.post(`/api/assignments/${res.data.id}/accept`);
    expect(accepted.data.status).toBe('ACCEPTED');
    expect((await vol.client.post(`/api/assignments/${res.data.id}/accept`)).status).toBe(409);
  });

  it('admin cannot assign an unapproved volunteer', async () => {
    const flow = await workflow('approved');
    const admin = await signedIn('ADMIN');
    const pending = await signedIn('VOLUNTEER', 'PENDING');
    const res = await admin.client.post('/api/assignments', { requestId: flow.request.id, volunteerProfileId: pending.user.profileId });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe('VOLUNTEER_UNAVAILABLE');
  });

  it('declining returns the delivery to the pool for another volunteer', async () => {
    const flow = await workflow('assigned');
    const res = await flow.volunteer!.client.post(`/api/assignments/${flow.assignment.id}/decline`, { reason: 'Bike broke down' });
    expect(res.data.status).toBe('DECLINED');
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).status).toBe('ACCEPTED');
    const other = await signedIn('VOLUNTEER');
    const open = await other.client.get('/api/assignments?scope=open&pageSize=50');
    expect(open.data.items.some((r: { id: string }) => r.id === flow.request.id)).toBe(true);
    expect((await other.client.post('/api/assignments', { requestId: flow.request.id })).status).toBe(201);
  });

  it('prevents two active assignments for one delivery, even under a race', async () => {
    const flow = await workflow('approved');
    const a = await signedIn('VOLUNTEER');
    const b = await signedIn('VOLUNTEER');
    const results = await Promise.all([
      a.client.post('/api/assignments', { requestId: flow.request.id }),
      b.client.post('/api/assignments', { requestId: flow.request.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const active = await prisma.volunteerAssignment.count({
      where: { requestId: flow.request.id, status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'] } },
    });
    expect(active).toBe(1);
  });

  it('cannot assign a request that is not approved', async () => {
    const flow = await workflow('requested');
    const vol = await signedIn('VOLUNTEER');
    const res = await vol.client.post('/api/assignments', { requestId: flow.request.id });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe('ALREADY_ASSIGNED');
  });

  it('pickup and delivery follow the lifecycle and record proof', async () => {
    const flow = await workflow('assigned', { quantity: 8 });
    const vol = flow.volunteer!.client;
    const id = flow.assignment.id;

    expect((await vol.post(`/api/assignments/${id}/deliver`, { photoUrl: '/api/uploads/0b9f6a2e-4c1d-4e8f-9a7b-1c2d3e4f5a6b.png', deliveredQuantity: 8 })).status).toBe(409);
    expect((await vol.post(`/api/assignments/${id}/pickup`, {})).data.status).toBe('PICKED_UP');
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).status).toBe('PICKED_UP');

    const missingProof = await vol.post(`/api/assignments/${id}/deliver`, { deliveredQuantity: 8 });
    expect(missingProof.status).toBe(400);
    expect(missingProof.data.details.fieldErrors.photoUrl).toBeDefined();

    const upload = await vol.upload('proof.png', PNG_BYTES, 'image/png');
    expect((await vol.post(`/api/assignments/${id}/deliver`, { photoUrl: upload.data.url, deliveredQuantity: 9 })).status).toBe(400); // > approved
    const done = await vol.post(`/api/assignments/${id}/deliver`, { photoUrl: upload.data.url, deliveredQuantity: 8 });
    expect(done.status).toBe(200);
    expect(done.data.status).toBe('DELIVERED');

    const proofs = await prisma.deliveryProof.findMany({ where: { requestId: flow.request.id }, orderBy: { createdAt: 'asc' } });
    expect(proofs.map((p) => p.type)).toEqual(['PICKUP', 'DELIVERY']);
    expect(proofs[1]).toMatchObject({ photoUrl: upload.data.url, quantity: 8, submittedById: flow.volunteer!.user.id });
    expect(await prisma.notification.count({ where: { userId: flow.ngo.user.id, type: 'DELIVERY_COMPLETED' } })).toBe(1);
  });

  it('NGO confirmation completes the request, records impact and completes the donation', async () => {
    const flow = await workflow('delivered', { quantity: 10 });
    const res = await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'CONFIRMED' });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('COMPLETED');
    const impact = await prisma.impactRecord.findUniqueOrThrow({ where: { requestId: flow.request.id } });
    expect(impact).toMatchObject({ mealsRescued: 10, weightKg: 4, co2SavedKg: 10, waterSavedLiters: 4000 });
    expect(impact.volunteerProfileId).toBe(flow.volunteer!.user.profileId);
    expect((await prisma.foodDonation.findUniqueOrThrow({ where: { id: flow.donation.id } })).status).toBe('COMPLETED');
    expect((await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'CONFIRMED' })).status).toBe(409);
  });

  it('NGO can dispute a delivery instead; no impact is recorded and admins are alerted', async () => {
    const admin = await signedIn('ADMIN');
    const flow = await workflow('delivered');
    const res = await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'DISPUTED', disputeReason: 'Half the trays were missing' });
    expect(res.data.status).toBe('DISPUTED');
    expect(await prisma.impactRecord.count({ where: { requestId: flow.request.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: admin.user.id, type: 'DISPUTE_RAISED' } })).toBeGreaterThan(0);
  });

  it('admin verifies a reported problem: delivery completes and impact is recorded for the verified quantity', async () => {
    const admin = await signedIn('ADMIN');
    const flow = await workflow('delivered', { quantity: 10 });
    await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'DISPUTED', disputeReason: 'Two trays were missing' });

    expect((await flow.ngo.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'VERIFY', note: 'Checked photos' })).status).toBe(403);
    expect((await admin.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'VERIFY', note: 'x' })).status).toBe(400); // note too short
    expect((await admin.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'VERIFY', note: 'Checked the photos', verifiedQuantity: 11 })).status).toBe(400);

    const res = await admin.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'VERIFY', note: 'Photos show 8 meals handed over', verifiedQuantity: 8 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: 'COMPLETED', deliveredQuantity: 8, disputeResolution: 'Photos show 8 meals handed over' });
    expect(res.data.disputeResolvedAt).not.toBeNull();
    expect(await prisma.impactRecord.findUniqueOrThrow({ where: { requestId: flow.request.id } })).toMatchObject({ mealsRescued: 8 });
    for (const userId of [flow.ngo.user.id, flow.donor.user.id, flow.volunteer!.user.id]) {
      expect(await prisma.notification.count({ where: { userId, type: 'DISPUTE_RESOLVED' } })).toBe(1);
    }
    expect(await prisma.auditLog.count({ where: { entityId: flow.request.id, action: 'DISPUTE_VERIFIED', userId: admin.user.id } })).toBe(1);
    expect((await admin.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'CLOSE', note: 'Second decision' })).status).toBe(409);
  });

  it('admin closes an unverifiable report: no impact, and it cannot be resolved twice', async () => {
    const admin = await signedIn('ADMIN');
    const flow = await workflow('delivered');
    await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'DISPUTED', disputeReason: 'Food arrived spoiled' });
    const res = await admin.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'CLOSE', note: 'Could not verify condition' });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('DISPUTED');
    expect(res.data.disputeResolvedAt).not.toBeNull();
    expect(await prisma.impactRecord.count({ where: { requestId: flow.request.id } })).toBe(0);
    expect((await admin.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'VERIFY', note: 'Changed my mind' })).status).toBe(409);
    const open = (await admin.client.get('/api/admin/stats')).data.openDisputes;
    const list = (await admin.client.get('/api/requests?status=DISPUTED&pageSize=50')).data.items;
    expect(list.filter((r: { disputeResolvedAt: string | null }) => !r.disputeResolvedAt)).toHaveLength(open);
  });

  it('only open disputes can be resolved', async () => {
    const admin = await signedIn('ADMIN');
    const flow = await workflow('delivered');
    expect((await admin.client.post(`/api/requests/${flow.request.id}/resolve`, { outcome: 'VERIFY', note: 'No dispute here' })).status).toBe(409);
  });

  it('admin can remove a volunteer before pickup; the volunteer cannot continue', async () => {
    const flow = await workflow('assigned');
    const admin = await signedIn('ADMIN');
    expect((await admin.client.post(`/api/assignments/${flow.assignment.id}/cancel`, { reason: 'Unreachable' })).data.status).toBe('CANCELLED');
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).status).toBe('ACCEPTED');
    expect((await flow.volunteer!.client.post(`/api/assignments/${flow.assignment.id}/pickup`, {})).status).toBe(409);
    expect((await flow.volunteer!.client.post(`/api/assignments/${flow.assignment.id}/cancel`, {})).status).toBe(403);
  });
});
