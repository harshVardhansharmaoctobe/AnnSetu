import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import type { AccountStatus, UserRole } from '@prisma/client';
import { testPrisma } from './test-db';
import { Client } from './http';

export const PASSWORD = 'TestPass123!';
let hash: string | null = null;

export const uniqueEmail = (label: string) => `${label}.${randomUUID().slice(0, 8)}@fbtest.invalid`;

const JAIPUR = { lat: 26.9124, lng: 75.7873 };

/** Creates a user directly in the test database, with a completed role profile by default. */
export async function createUser(role: UserRole, accountStatus: AccountStatus = 'APPROVED', opts: { profile?: boolean; label?: string } = {}) {
  const prisma = testPrisma();
  hash ??= await bcrypt.hash(PASSWORD, 4);
  const email = uniqueEmail(opts.label ?? role.toLowerCase());
  const user = await prisma.user.create({
    data: { email, name: `Test ${role} ${email.slice(0, 12)}`, password: hash, role, accountStatus, phone: '+91 90000 11111' },
  });
  const profile = opts.profile ?? true;
  let profileId: string | null = null;
  if (profile && role === 'DONOR') {
    profileId = (await prisma.donorProfile.create({
      data: { userId: user.id, organisationName: `Kitchen ${email.slice(0, 8)}`, organisationType: 'restaurant', address: '1 Test Road, Jaipur', latitude: JAIPUR.lat, longitude: JAIPUR.lng },
    })).id;
  } else if (profile && role === 'NGO') {
    profileId = (await prisma.nGOProfile.create({
      data: { userId: user.id, organisationName: `NGO ${email.slice(0, 8)}`, address: '2 Test Road, Jaipur', latitude: JAIPUR.lat + 0.02, longitude: JAIPUR.lng + 0.02, receivingCapacity: 100 },
    })).id;
  } else if (profile && role === 'VOLUNTEER') {
    profileId = (await prisma.volunteerProfile.create({
      data: { userId: user.id, address: '3 Test Road, Jaipur', latitude: JAIPUR.lat + 0.01, longitude: JAIPUR.lng },
    })).id;
  }
  return { ...user, profileId };
}

/** Creates a user and returns a signed-in client for it. */
export async function signedIn(role: UserRole, accountStatus: AccountStatus = 'APPROVED', opts: { profile?: boolean; label?: string } = {}) {
  const user = await createUser(role, accountStatus, opts);
  const client = new Client();
  const { error } = await client.login(user.email, PASSWORD);
  if (error) throw new Error(`Login failed for ${role}/${accountStatus}: ${error}`);
  return { user, client };
}

export function donationBody(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    foodName: 'Test veg biryani',
    description: 'Integration test donation',
    foodCategory: 'COOKED_MEALS',
    foodType: 'VEGETARIAN',
    quantity: 10,
    unit: 'MEALS',
    preparationTime: new Date(now - 60 * 60_000).toISOString(),
    safePickupDeadline: new Date(now + 6 * 3_600_000).toISOString(),
    storageConditions: 'Sealed, hot-held',
    pickupAddress: '1 Test Road, Jaipur',
    latitude: JAIPUR.lat,
    longitude: JAIPUR.lng,
    foodSafetyDeclared: true,
    ...overrides,
  };
}

/** Runs the workflow up to the given request status through the real API. */
export async function workflow(target: 'requested' | 'approved' | 'assigned' | 'picked' | 'delivered', opts: { quantity?: number } = {}) {
  const donor = await signedIn('DONOR');
  const ngo = await signedIn('NGO');
  const donation = (await donor.client.post('/api/donations', donationBody({ quantity: opts.quantity ?? 10 }))).data;
  const request = (await ngo.client.post('/api/requests', { donationId: donation.id, requestedQuantity: opts.quantity ?? 10 })).data;
  const result = { donor, ngo, donation, request, volunteer: null as Awaited<ReturnType<typeof signedIn>> | null, assignment: null as any };
  if (target === 'requested') return result;
  await donor.client.post(`/api/requests/${request.id}/approve`);
  if (target === 'approved') return result;
  const volunteer = await signedIn('VOLUNTEER');
  result.volunteer = volunteer;
  result.assignment = (await volunteer.client.post('/api/assignments', { requestId: request.id })).data;
  if (target === 'assigned') return result;
  await volunteer.client.post(`/api/assignments/${result.assignment.id}/pickup`, {});
  if (target === 'picked') return result;
  const { PNG_BYTES } = await import('./http');
  const upload = await volunteer.client.upload('proof.png', PNG_BYTES, 'image/png');
  await volunteer.client.post(`/api/assignments/${result.assignment.id}/deliver`, { photoUrl: upload.data.url, deliveredQuantity: opts.quantity ?? 10 });
  return result;
}
