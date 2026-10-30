import { describe, expect, it } from 'vitest';
import { Client, PNG_BYTES } from '../support/http';
import { createUser, donationBody, PASSWORD, signedIn, workflow } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();

async function openAssignment(requestId: string) {
  return prisma.volunteerAssignment.findFirstOrThrow({ where: { requestId, status: 'PENDING', volunteerProfileId: null } });
}

describe('assignment lifecycle (10 statuses)', () => {
  it('donor approval creates one open assignment and notifies nearby volunteers', async () => {
    const volunteer = await createUser('VOLUNTEER');
    const flow = await workflow('approved');
    const open = await openAssignment(flow.request.id);
    expect(open.status).toBe('PENDING');
    expect(await prisma.volunteerAssignment.count({ where: { requestId: flow.request.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: volunteer.id, type: 'ASSIGNMENT_AVAILABLE' } })).toBe(1);
  });

  it('two volunteers racing to accept the same open assignment: exactly one wins', async () => {
    const flow = await workflow('approved');
    const open = await openAssignment(flow.request.id);
    const a = await signedIn('VOLUNTEER');
    const b = await signedIn('VOLUNTEER');
    const results = await Promise.all([
      a.client.post(`/api/assignments/${open.id}/accept`),
      b.client.post(`/api/assignments/${open.id}/accept`),
    ]);
    // Exactly one winner. The loser either lost at the conditional update (409, it saw the delivery open)
    // or read it after the winner committed (404, another volunteer's assignment is hidden) – timing-dependent.
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect([404, 409]).toContain(statuses.find((s) => s !== 200));
    const row = await prisma.volunteerAssignment.findUniqueOrThrow({ where: { id: open.id } });
    expect(row.status).toBe('ACCEPTED');
    expect([a.user.profileId, b.user.profileId]).toContain(row.volunteerProfileId);
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).status).toBe('VOLUNTEER_ASSIGNED');
  });

  it('arrive → pickup (with proof) → in transit → deliver, in order only', async () => {
    const flow = await workflow('approved', { quantity: 20 });
    const open = await openAssignment(flow.request.id);
    const vol = await signedIn('VOLUNTEER');
    const id = open.id;
    expect((await vol.client.post(`/api/assignments/${id}/arrive`)).status).toBe(404); // not theirs yet
    await vol.client.post(`/api/assignments/${id}/accept`);

    expect((await vol.client.post(`/api/assignments/${id}/transit`)).status).toBe(409); // not picked up
    expect((await vol.client.post(`/api/assignments/${id}/arrive`)).data.status).toBe('PICKUP_IN_PROGRESS');
    expect((await vol.client.post(`/api/assignments/${id}/arrive`)).status).toBe(409);

    const pickupProof = await vol.client.upload('pickup.png', PNG_BYTES, 'image/png', 'PICKUP_PROOF');
    expect(pickupProof.status).toBe(201);
    expect((await vol.client.post(`/api/assignments/${id}/pickup`, { photoUrl: pickupProof.data.url })).data.status).toBe('PICKED_UP');
    expect((await vol.client.post(`/api/assignments/${id}/transit`)).data.status).toBe('IN_TRANSIT');
    const req = await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } });
    expect(req.status).toBe('IN_TRANSIT');
    expect(req.inTransitAt).not.toBeNull();

    // A pickup photo cannot be reused as delivery proof (wrong purpose).
    const wrong = await vol.client.post(`/api/assignments/${id}/deliver`, { photoUrl: pickupProof.data.url, deliveredQuantity: 20 });
    expect(wrong.status).toBe(400);
    expect(wrong.data.code).toBe('UPLOAD_NOT_OWNED');

    const deliveryProof = await vol.client.upload('handover.png', PNG_BYTES, 'image/png', 'DELIVERY_PROOF');
    expect((await vol.client.post(`/api/assignments/${id}/deliver`, { photoUrl: deliveryProof.data.url, deliveredQuantity: 20 })).data.status).toBe('DELIVERED');
    await flow.ngo.client.post(`/api/requests/${flow.request.id}/confirm`, { outcome: 'CONFIRMED', rating: 4, feedback: 'Good' });
    expect((await prisma.volunteerAssignment.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
    expect(await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).toMatchObject({ status: 'COMPLETED', feedbackRating: 4, feedbackComment: 'Good' });
  });

  it("a volunteer cannot use another volunteer's upload as proof", async () => {
    const flow = await workflow('picked');
    const other = await signedIn('VOLUNTEER');
    const foreign = await other.client.upload('x.png', PNG_BYTES, 'image/png', 'DELIVERY_PROOF');
    const res = await flow.volunteer!.client.post(`/api/assignments/${flow.assignment.id}/deliver`, { photoUrl: foreign.data.url, deliveredQuantity: 10 });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe('UPLOAD_NOT_OWNED');
  });

  it('withdrawing after acceptance keeps history and reopens a fresh assignment', async () => {
    const flow = await workflow('assigned');
    const res = await flow.volunteer!.client.post(`/api/assignments/${flow.assignment.id}/reject`, { reason: 'Vehicle broke down' });
    expect(res.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Vehicle broke down' });
    const rows = await prisma.volunteerAssignment.findMany({ where: { requestId: flow.request.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['REJECTED', 'PENDING']);
    expect(rows[1].volunteerProfileId).toBeNull();
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).status).toBe('ACCEPTED');
  });

  it('a failed delivery closes the request without returning collected food to the listing', async () => {
    const admin = await createUser('ADMIN');
    const flow = await workflow('picked', { quantity: 6 });
    const before = await prisma.foodDonation.findUniqueOrThrow({ where: { id: flow.donation.id } });
    expect((await flow.volunteer!.client.post(`/api/assignments/${flow.assignment.id}/fail`, { reason: 'x' })).status).toBe(400);
    const res = await flow.volunteer!.client.post(`/api/assignments/${flow.assignment.id}/fail`, { reason: 'Food spilled in transit' });
    expect(res.data.status).toBe('CANCELLED');
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: flow.request.id } })).status).toBe('CANCELLED');
    expect((await prisma.foodDonation.findUniqueOrThrow({ where: { id: flow.donation.id } })).remainingQuantity).toBe(before.remainingQuantity);
    expect(await prisma.notification.count({ where: { userId: admin.id, type: 'DELIVERY_FAILED' } })).toBe(1);
    expect(await prisma.impactRecord.count({ where: { requestId: flow.request.id } })).toBe(0);
  });
});

describe('donor listing controls', () => {
  it('mark unavailable: pending requests declined, approved ones honoured, nothing left to request', async () => {
    const donor = await signedIn('DONOR');
    const ngoA = await signedIn('NGO');
    const ngoB = await signedIn('NGO');
    const d = (await donor.client.post('/api/donations', donationBody({ quantity: 50 }))).data;
    const approved = (await ngoA.client.post('/api/requests', { donationId: d.id, requestedQuantity: 20 })).data;
    const pending = (await ngoB.client.post('/api/requests', { donationId: d.id, requestedQuantity: 10 })).data;
    await donor.client.post(`/api/requests/${approved.id}/approve`);

    const res = await donor.client.post(`/api/donations/${d.id}/close`);
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ remainingQuantity: 0, status: 'FULLY_RESERVED' });
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('REJECTED');
    expect((await prisma.foodRequest.findUniqueOrThrow({ where: { id: approved.id } })).status).toBe('ACCEPTED');
    expect((await ngoB.client.post('/api/requests', { donationId: d.id, requestedQuantity: 1 })).status).toBe(409);
    expect((await donor.client.post(`/api/donations/${d.id}/close`)).status).toBe(409);
  });

  it('delete is allowed only before any request, and only by the owner', async () => {
    const donor = await signedIn('DONOR');
    const other = await signedIn('DONOR');
    const fresh = (await donor.client.post('/api/donations', donationBody())).data;
    expect((await other.client.req('DELETE', `/api/donations/${fresh.id}`)).status).toBe(404);
    expect((await donor.client.req('DELETE', `/api/donations/${fresh.id}`)).status).toBe(200);
    expect(await prisma.foodDonation.count({ where: { id: fresh.id } })).toBe(0);

    const flow = await workflow('requested');
    expect((await flow.donor.client.req('DELETE', `/api/donations/${flow.donation.id}`)).status).toBe(409);
  });
});

describe('password reset and change', () => {
  it('forgot-password answers identically for known and unknown emails', async () => {
    const user = await createUser('NGO');
    const known = await new Client().post('/api/password/forgot', { email: user.email });
    const unknown = await new Client().post('/api/password/forgot', { email: `nobody.${Date.now()}@fbtest.invalid` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.data).toEqual(unknown.data);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('admin-issued reset link sets a new password, revokes old sessions and works once', async () => {
    const admin = await signedIn('ADMIN');
    const target = await signedIn('DONOR');
    expect((await target.client.get('/api/profile')).status).toBe(200);
    expect((await target.client.post(`/api/admin/users/${target.user.id}/reset-link`)).status).toBe(403); // admins only

    const link = await admin.client.post(`/api/admin/users/${target.user.id}/reset-link`);
    expect(link.status).toBe(200);
    const token = new URL(link.data.resetUrl).searchParams.get('token')!;
    const reset = await new Client().post('/api/password/reset', { token, password: 'BrandNewPass9', confirmPassword: 'BrandNewPass9' });
    expect(reset.status).toBe(200);

    // Sessions issued before the change are revoked (iat is second-granular, so wait past the boundary).
    await new Promise((r) => setTimeout(r, 1100));
    expect((await target.client.get('/api/profile')).status).toBe(401);
    expect((await new Client().login(target.user.email, PASSWORD)).error).toBe('Invalid email or password');
    expect((await new Client().login(target.user.email, 'BrandNewPass9')).error).toBeNull();
    const reuse = await new Client().post('/api/password/reset', { token, password: 'AnotherPass9', confirmPassword: 'AnotherPass9' });
    expect(reuse.status).toBe(400);
    expect(reuse.data.code).toBe('INVALID_TOKEN');
  });

  it('change password requires the current password', async () => {
    const { client, user } = await signedIn('VOLUNTEER');
    const wrong = await client.post('/api/password/change', { currentPassword: 'not-it', newPassword: 'ChangedPass9', confirmPassword: 'ChangedPass9' });
    expect(wrong.status).toBe(400);
    expect(wrong.data.code).toBe('WRONG_PASSWORD');
    expect((await client.post('/api/password/change', { currentPassword: PASSWORD, newPassword: 'ChangedPass9', confirmPassword: 'ChangedPass9' })).status).toBe(200);
    expect((await new Client().login(user.email, 'ChangedPass9')).error).toBeNull();
  });
});

describe('profile photos', () => {
  it('a user can set their own uploaded avatar but not someone else\'s; pending users can upload one', async () => {
    const pending = await signedIn('NGO', 'PENDING');
    const own = await pending.client.upload('me.png', PNG_BYTES, 'image/png', 'AVATAR');
    expect(own.status).toBe(201);
    expect((await pending.client.put('/api/profile', { avatarUrl: own.data.url })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: pending.user.id } })).avatarUrl).toBe(own.data.url);

    const other = await signedIn('DONOR');
    const res = await other.client.put('/api/profile', { avatarUrl: own.data.url });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe('UPLOAD_NOT_OWNED');
    expect((await pending.client.put('/api/profile', { avatarUrl: null })).status).toBe(200);
  });
});

describe('admin analytics', () => {
  it('returns period reports to admins only', async () => {
    const admin = await signedIn('ADMIN');
    const res = await admin.client.get('/api/admin/analytics?interval=week');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.trends)).toBe(true);
    expect(res.data.range.interval).toBe('week');
    expect((await (await signedIn('NGO')).client.get('/api/admin/analytics')).status).toBe(403);
    expect((await admin.client.get('/api/admin/analytics?from=2026-12-01&to=2026-01-01')).status).toBe(400);
  });
});
