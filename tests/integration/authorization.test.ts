import { describe, expect, it } from 'vitest';
import { Client } from '../support/http';
import { donationBody, signedIn, workflow } from '../support/factories';

describe('role-based access control', () => {
  it('a donor cannot use NGO-only endpoints', async () => {
    const { client } = await signedIn('DONOR');
    expect((await client.post('/api/requests', { donationId: 'x', requestedQuantity: 1 })).status).toBe(403);
    expect((await client.get('/api/donations?scope=available')).status).toBe(403);
  });

  it('an NGO cannot use donor-only endpoints', async () => {
    const { client } = await signedIn('NGO');
    expect((await client.post('/api/donations', donationBody())).status).toBe(403);
    expect((await client.post('/api/requests/x/approve')).status).toBe(403);
    expect((await client.get('/api/donations?scope=mine')).status).toBe(403);
  });

  it('a volunteer cannot use admin endpoints', async () => {
    const { client } = await signedIn('VOLUNTEER');
    for (const url of ['/api/admin/stats', '/api/admin/users', '/api/admin/audit']) {
      expect((await client.get(url)).status).toBe(403);
    }
    expect((await client.post('/api/admin/users/someone', { action: 'approve' })).status).toBe(403);
  });

  it('non-admins cannot approve accounts', async () => {
    const target = await signedIn('NGO', 'PENDING');
    for (const role of ['DONOR', 'NGO', 'VOLUNTEER'] as const) {
      const { client } = await signedIn(role);
      expect((await client.post(`/api/admin/users/${target.user.id}`, { action: 'approve' })).status).toBe(403);
    }
  });

  it('unauthenticated requests are rejected on every protected API', async () => {
    const anon = new Client();
    for (const [method, url] of [
      ['GET', '/api/donations'], ['POST', '/api/donations'], ['GET', '/api/requests'], ['POST', '/api/requests'],
      ['GET', '/api/assignments'], ['POST', '/api/assignments'], ['GET', '/api/notifications'], ['GET', '/api/admin/stats'],
      ['POST', '/api/uploads'], ['GET', '/api/impact?scope=me'],
    ]) {
      expect((await anon.req(method, url, method === 'GET' ? {} : { json: {} })).status, `${method} ${url}`).toBe(401);
    }
  });

  it.each([['PENDING'], ['REJECTED']] as const)('%s accounts cannot use operational APIs', async (status) => {
    const donor = await signedIn('DONOR', status);
    const res = await donor.client.post('/api/donations', donationBody());
    expect(res.status).toBe(403);
    expect(res.data.code).toBe(`ACCOUNT_${status}`);
    const ngo = await signedIn('NGO', status);
    expect((await ngo.client.get('/api/donations')).status).toBe(403);
    const vol = await signedIn('VOLUNTEER', status);
    expect((await vol.client.get('/api/assignments?scope=open')).status).toBe(403);
  });
});

describe('ownership', () => {
  it("a donor cannot see, edit, cancel or decide on another donor's donation", async () => {
    const flow = await workflow('requested');
    const other = await signedIn('DONOR');
    expect((await other.client.get(`/api/donations/${flow.donation.id}`)).status).toBe(404);
    expect((await other.client.patch(`/api/donations/${flow.donation.id}`, { foodName: 'Hijacked' })).status).toBe(404);
    expect((await other.client.post(`/api/donations/${flow.donation.id}/cancel`)).status).toBe(404);
    expect((await other.client.post(`/api/requests/${flow.request.id}/approve`)).status).toBe(404);
    expect((await other.client.post(`/api/requests/${flow.request.id}/reject`, {})).status).toBe(404);
  });

  it("an NGO cannot see or act on another NGO's request", async () => {
    const flow = await workflow('requested');
    const other = await signedIn('NGO');
    expect((await other.client.get(`/api/requests/${flow.request.id}`)).status).toBe(404);
    expect((await other.client.post(`/api/requests/${flow.request.id}/cancel`, {})).status).toBe(404);
    const list = await other.client.get('/api/requests');
    expect(list.data.items.some((r: { id: string }) => r.id === flow.request.id)).toBe(false);
  });

  it("an NGO only sees its own request on a shared donation", async () => {
    const flow = await workflow('requested', { quantity: 4 });
    const other = await signedIn('NGO');
    await other.client.post('/api/requests', { donationId: flow.donation.id, requestedQuantity: 3 });
    const view = await other.client.get(`/api/donations/${flow.donation.id}`);
    expect(view.status).toBe(200);
    expect(view.data.requests).toBeUndefined();
    expect(view.data.myRequest.requestedQuantity).toBe(3);
    expect(view.data.contactPhone).toBeNull(); // contact shared only after approval
  });

  it("a volunteer cannot read or update another volunteer's assignment", async () => {
    const flow = await workflow('assigned');
    const other = await signedIn('VOLUNTEER');
    expect((await other.client.get(`/api/assignments/${flow.assignment.id}`)).status).toBe(404);
    for (const action of ['accept', 'decline', 'pickup']) {
      expect((await other.client.post(`/api/assignments/${flow.assignment.id}/${action}`, {})).status).toBe(404);
    }
    expect((await other.client.get(`/api/requests/${flow.request.id}`)).status).toBe(404);
  });

  it('a volunteer cannot claim on behalf of someone else', async () => {
    const flow = await workflow('approved');
    const a = await signedIn('VOLUNTEER');
    const b = await signedIn('VOLUNTEER');
    const res = await a.client.post('/api/assignments', { requestId: flow.request.id, volunteerProfileId: b.user.profileId });
    expect(res.status).toBe(403);
  });
});
