import { Prisma, type AssignmentStatus, type DonationStatus, type RequestStatus, type UploadPurpose } from '@prisma/client';
import type { Session } from 'next-auth';
import prisma from '@/lib/db';
import { badRequest, conflict, forbidden, notFound } from '@/lib/api';
import { audit, notify, notifyAdmins } from '@/lib/events';
import { calculateImpact } from '@/lib/matching';
import { calculateDistance } from '@/lib/utils';
import type {
  DonationCreateInput,
  DonationUpdateInput,
  FoodRequestInput,
} from '@/lib/validations';

/**
 * FoodBridge workflow service – the only place that changes donation/request/assignment state.
 *
 * Every transition is a conditional update on the expected current status inside a transaction.
 * If another request changed the row first, the update matches 0 rows and the whole transaction
 * rolls back with a 409, so double approvals, double acceptances and over-allocation cannot happen.
 *
 * Assignment allocation policy
 *   - Donor approval creates one PENDING assignment for the request (no volunteer yet) and notifies
 *     available volunteers whose service area covers the pickup point.
 *   - A volunteer accepts a PENDING assignment, or an admin offers it to one volunteer (ASSIGNED),
 *     who accepts or rejects.
 *   - Rejection, admin removal and volunteer suspension close the row (history) and open a fresh
 *     PENDING row for the same request in the same transaction (reassignment).
 */

export type Actor = Session['user'];
type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export const OPEN_DONATION_STATUSES: DonationStatus[] = ['AVAILABLE', 'PARTIALLY_RESERVED'];
/** Assignments that still need work (exactly one per approved request at any time). */
export const OPEN_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  'PENDING', 'ASSIGNED', 'ACCEPTED', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED',
];
/** Assignments a volunteer is actively holding (before handover). */
export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['ASSIGNED', 'ACCEPTED', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'IN_TRANSIT'];
/** Before the food has been collected – the volunteer can still be replaced. */
const RELEASABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['ASSIGNED', 'ACCEPTED', 'PICKUP_IN_PROGRESS'];
const FOOD_MOVING_REQUEST_STATUSES: RequestStatus[] = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];
const UNFINISHED_REQUEST_STATUSES: RequestStatus[] = ['PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];

const transaction = <T>(fn: (tx: Tx) => Promise<T>) =>
  prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });

function invalidTransition(message: string) {
  return conflict(message, 'INVALID_TRANSITION');
}

const pretty = (status: string) => status.toLowerCase().replace(/_/g, ' ');

/** Rounds to 2 decimals so repeated float decrements cannot leave values like 0.30000000004. */
const round2 = (n: number) => Math.round(n * 100) / 100;

function availabilityStatus(quantity: number, remaining: number): DonationStatus {
  if (remaining <= 0) return 'FULLY_RESERVED';
  if (remaining < quantity) return 'PARTIALLY_RESERVED';
  return 'AVAILABLE';
}

const donorLink = (donationId: string) => `/dashboard/donor/donations/${donationId}`;
const ngoLink = (requestId: string) => `/dashboard/ngo/requests/${requestId}`;
const volunteerLink = (assignmentId: string) => `/dashboard/volunteer/assignments/${assignmentId}`;

// ─── Profiles and uploads ───

async function requireDonorProfile(db: Db, userId: string) {
  const profile = await db.donorProfile.findUnique({ where: { userId } });
  if (!profile) throw conflict('Complete your donor profile first', 'PROFILE_INCOMPLETE');
  return profile;
}

async function requireNgoProfile(db: Db, userId: string) {
  const profile = await db.nGOProfile.findUnique({ where: { userId } });
  if (!profile) throw conflict('Complete your NGO profile first', 'PROFILE_INCOMPLETE');
  return profile;
}

/** Volunteer profiles have no required fields, so one is created on first use. */
export async function ensureVolunteerProfile(db: Db, userId: string) {
  return db.volunteerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
}

/** An image may only be referenced by the user who uploaded it, for the purpose it was uploaded for. */
export async function assertOwnUpload(db: Db, url: string | undefined | null, userId: string, purpose: UploadPurpose) {
  if (!url) return;
  const upload = await db.upload.findUnique({ where: { url }, select: { uploadedById: true, purpose: true } });
  if (!upload || upload.uploadedById !== userId || upload.purpose !== purpose) {
    throw badRequest('Use an image you uploaded for this purpose', 'UPLOAD_NOT_OWNED');
  }
}

// ─── Expiry ───

/**
 * Lazily expires donations whose pickup deadline has passed while still open, and closes
 * the pending requests on them. Called before listings so stale food is never offered.
 */
export async function expireStaleDonations() {
  const now = new Date();
  const stale = await prisma.foodDonation.findMany({
    where: { status: { in: OPEN_DONATION_STATUSES }, safePickupDeadline: { lte: now } },
    select: { id: true },
    take: 500,
  });
  if (stale.length === 0) return 0;
  const ids = stale.map((d) => d.id);
  await transaction(async (tx) => {
    await tx.foodDonation.updateMany({
      where: { id: { in: ids }, status: { in: OPEN_DONATION_STATUSES } },
      data: { status: 'EXPIRED' },
    });
    await tx.foodRequest.updateMany({
      where: { donationId: { in: ids }, status: 'PENDING' },
      data: { status: 'CANCELLED', rejectionReason: 'Donation expired before it was approved' },
    });
  });
  return ids.length;
}

// ─── Donations ───

export async function createDonation(actor: Actor, input: DonationCreateInput) {
  const profile = await requireDonorProfile(prisma, actor.id);
  await assertOwnUpload(prisma, input.photoUrl, actor.id, 'DONATION_PHOTO');
  return transaction(async (tx) => {
    const donation = await tx.foodDonation.create({
      data: { ...input, donorProfileId: profile.id, remainingQuantity: input.quantity, status: 'AVAILABLE' },
    });
    await audit(tx, { userId: actor.id, action: 'DONATION_CREATED', entity: 'FoodDonation', entityId: donation.id });
    return donation;
  });
}

async function findOwnDonation(tx: Tx, actor: Actor, donationId: string) {
  const donation = await tx.foodDonation.findUnique({
    where: { id: donationId },
    include: { donorProfile: { select: { userId: true } } },
  });
  // Someone else's donation is reported as not found so ids cannot be probed.
  if (!donation || donation.donorProfile.userId !== actor.id) throw notFound('Donation not found');
  return donation;
}

export async function updateDonation(actor: Actor, donationId: string, input: DonationUpdateInput) {
  await assertOwnUpload(prisma, input.photoUrl, actor.id, 'DONATION_PHOTO');
  return transaction(async (tx) => {
    const donation = await findOwnDonation(tx, actor, donationId);
    if (donation.status !== 'AVAILABLE') {
      throw invalidTransition('Only available donations with no approved requests can be edited');
    }
    const activeRequests = await tx.foodRequest.count({
      where: { donationId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    });
    if (activeRequests > 0) {
      throw invalidTransition('This donation already has NGO requests; cancel it and create a new one instead');
    }

    const preparationTime = input.preparationTime ?? donation.preparationTime;
    const deadline = input.safePickupDeadline ?? donation.safePickupDeadline;
    if (deadline <= preparationTime) throw badRequest('Pickup deadline must be after preparation time');
    if (deadline <= new Date()) throw badRequest('Pickup deadline must be in the future');

    const data: Prisma.FoodDonationUpdateManyMutationInput = { ...input };
    if (input.quantity !== undefined) data.remainingQuantity = input.quantity; // nothing is reserved yet

    const updated = await tx.foodDonation.updateMany({
      where: { id: donationId, status: 'AVAILABLE', updatedAt: donation.updatedAt },
      data,
    });
    if (updated.count === 0) throw conflict('The donation changed while you were editing; reload and try again');
    await audit(tx, { userId: actor.id, action: 'DONATION_UPDATED', entity: 'FoodDonation', entityId: donationId });
    return tx.foodDonation.findUniqueOrThrow({ where: { id: donationId } });
  });
}

/** Hard delete – only for a donation that no NGO has ever requested. */
export async function deleteDonation(actor: Actor, donationId: string) {
  return transaction(async (tx) => {
    const donation = await findOwnDonation(tx, actor, donationId);
    const requests = await tx.foodRequest.count({ where: { donationId } });
    if (requests > 0) {
      throw invalidTransition('Donations that NGOs have requested cannot be deleted – cancel or mark them unavailable instead');
    }
    await tx.foodDonation.delete({ where: { id: donationId } });
    await audit(tx, { userId: actor.id, action: 'DONATION_DELETED', entity: 'FoodDonation', entityId: donationId, details: donation.foodName });
    return { id: donationId, deleted: true };
  });
}

/**
 * "Mark unavailable": stop accepting new requests while honouring approved ones.
 * Pending requests are declined, the unreserved quantity is withdrawn, and the donation becomes
 * FULLY_RESERVED/COMPLETED (if requests were approved) or CANCELLED (if none were).
 */
export async function closeDonation(actor: Actor, donationId: string) {
  return transaction(async (tx) => {
    const donation = await findOwnDonation(tx, actor, donationId);
    if (!OPEN_DONATION_STATUSES.includes(donation.status)) {
      throw invalidTransition(`A ${pretty(donation.status)} donation is already closed to new requests`);
    }
    const pending = await tx.foodRequest.findMany({
      where: { donationId, status: 'PENDING' },
      select: { id: true, ngoProfile: { select: { userId: true } } },
    });
    await tx.foodRequest.updateMany({
      where: { donationId, status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: 'The donor marked the remaining food as unavailable' },
    });
    const approved = await tx.foodRequest.count({ where: { donationId, status: { notIn: ['PENDING', 'REJECTED', 'CANCELLED'] } } });
    const moved = await tx.foodDonation.updateMany({
      where: { id: donationId, status: { in: OPEN_DONATION_STATUSES } },
      data: approved > 0 ? { remainingQuantity: 0, status: 'FULLY_RESERVED' } : { status: 'CANCELLED' },
    });
    if (moved.count === 0) throw conflict('The donation changed; reload and try again');
    if (approved > 0) await refreshDonationStatus(tx, donationId);

    await notify(tx, pending.map((r) => ({
      userId: r.ngoProfile.userId,
      type: 'REQUEST_REJECTED' as const,
      title: 'Food no longer available',
      message: `The donor marked "${donation.foodName}" as unavailable, so your request was closed.`,
      link: ngoLink(r.id),
    })));
    await audit(tx, { userId: actor.id, action: 'DONATION_CLOSED', entity: 'FoodDonation', entityId: donationId });
    return tx.foodDonation.findUniqueOrThrow({ where: { id: donationId } });
  });
}

export async function cancelDonation(actor: Actor, donationId: string) {
  return transaction(async (tx) => {
    const donation = await findOwnDonation(tx, actor, donationId);
    if (donation.status === 'COMPLETED' || donation.status === 'CANCELLED') {
      throw invalidTransition(`A ${pretty(donation.status)} donation cannot be cancelled`);
    }
    const inProgress = await tx.foodRequest.count({
      where: {
        donationId,
        OR: [
          { status: { in: FOOD_MOVING_REQUEST_STATUSES } },
          { status: 'VOLUNTEER_ASSIGNED' },
        ],
      },
    });
    if (inProgress > 0) throw invalidTransition('A volunteer is already handling food from this donation; it cannot be cancelled');

    const affected = await tx.foodRequest.findMany({
      where: { donationId, status: { in: ['PENDING', 'ACCEPTED'] } },
      select: { id: true, ngoProfile: { select: { userId: true } } },
    });
    const affectedIds = affected.map((r) => r.id);
    const offered = await tx.volunteerAssignment.findMany({
      where: { requestId: { in: affectedIds }, status: { in: ['PENDING', 'ASSIGNED'] } },
      select: { id: true, volunteerProfile: { select: { userId: true } } },
    });
    await tx.volunteerAssignment.updateMany({
      where: { requestId: { in: affectedIds }, status: { in: ['PENDING', 'ASSIGNED'] } },
      data: { status: 'CANCELLED', notes: 'Donation cancelled by the donor' },
    });
    await tx.foodRequest.updateMany({
      where: { id: { in: affectedIds } },
      data: { status: 'CANCELLED', rejectionReason: 'The donor cancelled this donation' },
    });
    const updated = await tx.foodDonation.updateMany({
      where: { id: donationId, status: donation.status },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) throw conflict('The donation changed; reload and try again');

    await notify(tx, [
      ...affected.map((r) => ({
        userId: r.ngoProfile.userId,
        type: 'DONATION_CANCELLED' as const,
        title: 'Donation cancelled',
        message: `"${donation.foodName}" was cancelled by the donor. Your request has been closed.`,
        link: ngoLink(r.id),
      })),
      ...offered.filter((a) => a.volunteerProfile).map((a) => ({
        userId: a.volunteerProfile!.userId,
        type: 'ASSIGNMENT_CANCELLED' as const,
        title: 'Delivery cancelled',
        message: `"${donation.foodName}" was cancelled by the donor.`,
      })),
    ]);
    await audit(tx, { userId: actor.id, action: 'DONATION_CANCELLED', entity: 'FoodDonation', entityId: donationId });
    return tx.foodDonation.findUniqueOrThrow({ where: { id: donationId } });
  });
}

// ─── Requests ───

export async function createRequest(actor: Actor, input: FoodRequestInput) {
  const ngo = await requireNgoProfile(prisma, actor.id);
  try {
    return await transaction(async (tx) => {
      const donation = await tx.foodDonation.findUnique({
        where: { id: input.donationId },
        include: { donorProfile: { include: { user: { select: { id: true, accountStatus: true } } } } },
      });
      if (!donation || donation.donorProfile.user.accountStatus !== 'APPROVED') throw notFound('Donation not found');
      if (!OPEN_DONATION_STATUSES.includes(donation.status) || donation.safePickupDeadline <= new Date()) {
        throw conflict('This donation is no longer available', 'DONATION_UNAVAILABLE');
      }
      if (input.requestedQuantity > donation.remainingQuantity) {
        throw badRequest(
          `Only ${donation.remainingQuantity} ${donation.unit.toLowerCase()} remain available`,
          'QUANTITY_EXCEEDS_AVAILABLE'
        );
      }

      const existing = await tx.foodRequest.findUnique({
        where: { donationId_ngoProfileId: { donationId: donation.id, ngoProfileId: ngo.id } },
      });
      let request;
      if (existing) {
        if (existing.status !== 'CANCELLED') {
          throw conflict('You have already requested this donation', 'DUPLICATE_REQUEST');
        }
        // Reactivate the NGO's own cancelled request instead of creating a duplicate row.
        const reopened = await tx.foodRequest.updateMany({
          where: { id: existing.id, status: 'CANCELLED' },
          data: {
            status: 'PENDING', requestedQuantity: input.requestedQuantity, beneficiaryCount: input.beneficiaryCount ?? null,
            notes: input.notes ?? null, rejectionReason: null, approvedAt: null,
          },
        });
        if (reopened.count === 0) throw conflict('You have already requested this donation', 'DUPLICATE_REQUEST');
        request = await tx.foodRequest.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        request = await tx.foodRequest.create({
          data: {
            donationId: donation.id, ngoProfileId: ngo.id, requestedQuantity: input.requestedQuantity,
            beneficiaryCount: input.beneficiaryCount, notes: input.notes,
          },
        });
      }

      await notify(tx, {
        userId: donation.donorProfile.user.id,
        type: 'NEW_REQUEST',
        title: 'New food request',
        message: `${ngo.organisationName} requested ${input.requestedQuantity} ${donation.unit.toLowerCase()} of "${donation.foodName}".`,
        link: donorLink(donation.id),
      });
      await audit(tx, { userId: actor.id, action: 'REQUEST_CREATED', entity: 'FoodRequest', entityId: request.id });
      return request;
    });
  } catch (error) {
    // Two concurrent requests from the same NGO: the unique index rejects the second.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('You have already requested this donation', 'DUPLICATE_REQUEST');
    }
    throw error;
  }
}

const requestWithParties = {
  donation: { include: { donorProfile: { select: { userId: true, organisationName: true } } } },
  ngoProfile: { select: { userId: true, organisationName: true } },
} satisfies Prisma.FoodRequestInclude;

async function findRequestForDonor(tx: Tx, actor: Actor, requestId: string) {
  const request = await tx.foodRequest.findUnique({ where: { id: requestId }, include: requestWithParties });
  if (!request || request.donation.donorProfile.userId !== actor.id) throw notFound('Request not found');
  return request;
}

async function findRequestForNgo(tx: Tx, actor: Actor, requestId: string) {
  const request = await tx.foodRequest.findUnique({ where: { id: requestId }, include: requestWithParties });
  if (!request || request.ngoProfile.userId !== actor.id) throw notFound('Request not found');
  return request;
}

async function refreshDonationStatus(tx: Tx, donationId: string) {
  const donation = await tx.foodDonation.findUniqueOrThrow({ where: { id: donationId } });
  if (!['AVAILABLE', 'PARTIALLY_RESERVED', 'FULLY_RESERVED'].includes(donation.status)) return donation;

  let status = availabilityStatus(donation.quantity, donation.remainingQuantity);
  if (status === 'FULLY_RESERVED') {
    const unfinished = await tx.foodRequest.count({
      where: { donationId, status: { in: UNFINISHED_REQUEST_STATUSES } },
    });
    if (unfinished === 0) status = 'COMPLETED';
  }
  if (status !== donation.status) {
    await tx.foodDonation.update({ where: { id: donationId }, data: { status } });
  }
  return { ...donation, status };
}

/** Notifies approved, available volunteers whose service area covers the pickup point. */
async function announceAssignment(tx: Tx, assignmentId: string, donation: { foodName: string; latitude: number; longitude: number }) {
  const volunteers = await tx.volunteerProfile.findMany({
    where: { isAvailable: true, user: { role: 'VOLUNTEER', accountStatus: 'APPROVED' } },
    select: { userId: true, latitude: true, longitude: true, maxDistance: true },
    take: 500,
  });
  const nearby = volunteers
    .filter((v) => v.latitude === null || v.longitude === null
      || calculateDistance(v.latitude, v.longitude, donation.latitude, donation.longitude) <= v.maxDistance)
    .slice(0, 50);
  await notify(tx, nearby.map((v) => ({
    userId: v.userId,
    type: 'ASSIGNMENT_AVAILABLE' as const,
    title: 'New delivery near you',
    message: `"${donation.foodName}" needs a volunteer. Accept it before someone else does.`,
    link: volunteerLink(assignmentId),
  })));
}

export async function approveRequest(actor: Actor, requestId: string) {
  return transaction(async (tx) => {
    const request = await findRequestForDonor(tx, actor, requestId);
    if (request.status !== 'PENDING') throw invalidTransition(`A ${pretty(request.status)} request cannot be approved`);
    if (request.donation.safePickupDeadline <= new Date()) {
      throw conflict('The pickup deadline for this donation has passed', 'DONATION_UNAVAILABLE');
    }

    // Atomic reservation: succeeds only if enough quantity is still unreserved.
    const reserved = await tx.foodDonation.updateMany({
      where: {
        id: request.donationId,
        status: { in: OPEN_DONATION_STATUSES },
        remainingQuantity: { gte: request.requestedQuantity },
      },
      data: { remainingQuantity: { decrement: request.requestedQuantity } },
    });
    if (reserved.count === 0) {
      throw conflict('Not enough quantity remains to approve this request', 'QUANTITY_UNAVAILABLE');
    }
    const moved = await tx.foodRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'ACCEPTED', approvedAt: new Date() },
    });
    if (moved.count === 0) throw invalidTransition('This request was already handled');

    const donation = await tx.foodDonation.findUniqueOrThrow({ where: { id: request.donationId } });
    await tx.foodDonation.update({
      where: { id: donation.id },
      data: { remainingQuantity: round2(donation.remainingQuantity) },
    });
    await refreshDonationStatus(tx, donation.id);

    // The delivery job is created with the approval and opened to eligible volunteers.
    const assignment = await tx.volunteerAssignment.create({ data: { requestId, status: 'PENDING' } });
    await announceAssignment(tx, assignment.id, request.donation);

    await notify(tx, {
      userId: request.ngoProfile.userId,
      type: 'REQUEST_APPROVED',
      title: 'Request approved',
      message: `${request.donation.donorProfile.organisationName} approved your request for "${request.donation.foodName}". A volunteer will collect it.`,
      link: ngoLink(requestId),
    });
    await notifyAdmins(tx, {
      type: 'GENERAL',
      title: 'Delivery needs a volunteer',
      message: `${request.ngoProfile.organisationName}'s request for "${request.donation.foodName}" was approved and is open to volunteers.`,
      link: '/dashboard/admin/deliveries',
    });
    await audit(tx, { userId: actor.id, action: 'REQUEST_APPROVED', entity: 'FoodRequest', entityId: requestId });
    return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
  });
}

export async function rejectRequest(actor: Actor, requestId: string, reason?: string) {
  return transaction(async (tx) => {
    const request = await findRequestForDonor(tx, actor, requestId);
    const moved = await tx.foodRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: reason ?? null },
    });
    if (moved.count === 0) throw invalidTransition(`A ${pretty(request.status)} request cannot be rejected`);
    await notify(tx, {
      userId: request.ngoProfile.userId,
      type: 'REQUEST_REJECTED',
      title: 'Request declined',
      message: `Your request for "${request.donation.foodName}" was declined${reason ? `: ${reason}` : '.'}`,
      link: ngoLink(requestId),
    });
    await audit(tx, { userId: actor.id, action: 'REQUEST_REJECTED', entity: 'FoodRequest', entityId: requestId, details: reason });
    return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
  });
}

/** NGO withdraws a request before pickup; reserved quantity is released and open assignments cancelled. */
export async function cancelRequest(actor: Actor, requestId: string, reason?: string) {
  return transaction(async (tx) => {
    const request = await findRequestForNgo(tx, actor, requestId);
    if (!['PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED'].includes(request.status)) {
      throw invalidTransition(`A ${pretty(request.status)} request cannot be cancelled`);
    }
    const moved = await tx.foodRequest.updateMany({
      where: { id: requestId, status: request.status },
      data: { status: 'CANCELLED', rejectionReason: reason ?? 'Cancelled by the NGO' },
    });
    if (moved.count === 0) throw conflict('The request changed; reload and try again');

    if (request.status !== 'PENDING') {
      await tx.foodDonation.update({
        where: { id: request.donationId },
        data: { remainingQuantity: { increment: request.requestedQuantity } },
      });
      await refreshDonationStatus(tx, request.donationId);
    }

    const open = await tx.volunteerAssignment.findMany({
      where: { requestId, status: { in: ['PENDING', ...RELEASABLE_ASSIGNMENT_STATUSES] } },
      include: { volunteerProfile: { select: { userId: true } } },
    });
    await tx.volunteerAssignment.updateMany({
      where: { requestId, status: { in: ['PENDING', ...RELEASABLE_ASSIGNMENT_STATUSES] } },
      data: { status: 'CANCELLED', notes: 'Request withdrawn by the NGO' },
    });

    await notify(tx, [
      {
        userId: request.donation.donorProfile.userId,
        type: 'REQUEST_CANCELLED',
        title: 'Request withdrawn',
        message: `${request.ngoProfile.organisationName} withdrew its request for "${request.donation.foodName}".`,
        link: donorLink(request.donationId),
      },
      ...open.filter((a) => a.volunteerProfile).map((a) => ({
        userId: a.volunteerProfile!.userId,
        type: 'ASSIGNMENT_CANCELLED' as const,
        title: 'Delivery cancelled',
        message: `The delivery of "${request.donation.foodName}" was cancelled by the NGO.`,
        link: volunteerLink(a.id),
      })),
    ]);
    await audit(tx, { userId: actor.id, action: 'REQUEST_CANCELLED', entity: 'FoodRequest', entityId: requestId, details: reason });
    return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
  });
}

/** Moves the delivered assignment to COMPLETED and records impact for the confirmed quantity. */
async function completeDelivery(tx: Tx, request: { id: string; ngoProfileId: string; donation: { donorProfileId: string; unit: 'MEALS' | 'KG' } }, quantity: number) {
  const delivered = await tx.volunteerAssignment.findFirst({
    where: { requestId: request.id, status: 'DELIVERED' },
    select: { id: true, volunteerProfileId: true, volunteerProfile: { select: { userId: true } } },
  });
  if (delivered) {
    await tx.volunteerAssignment.update({ where: { id: delivered.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  }
  await tx.impactRecord.create({
    data: {
      requestId: request.id,
      donorProfileId: request.donation.donorProfileId,
      ngoProfileId: request.ngoProfileId,
      volunteerProfileId: delivered?.volunteerProfileId,
      ...calculateImpact(quantity, request.donation.unit),
    },
  });
  return delivered;
}

/** NGO confirms receipt (records impact, optional feedback) or reports a problem. */
export async function confirmReceipt(
  actor: Actor,
  requestId: string,
  input:
    | { outcome: 'CONFIRMED'; notes?: string; rating?: number; feedback?: string }
    | { outcome: 'DISPUTED'; disputeReason: string }
) {
  return transaction(async (tx) => {
    const request = await findRequestForNgo(tx, actor, requestId);
    if (request.status !== 'DELIVERED') throw invalidTransition('Only delivered requests can be confirmed');

    if (input.outcome === 'DISPUTED') {
      const moved = await tx.foodRequest.updateMany({
        where: { id: requestId, status: 'DELIVERED' },
        data: { status: 'DISPUTED', disputeReason: input.disputeReason },
      });
      if (moved.count === 0) throw conflict('The request changed; reload and try again');
      await notify(tx, {
        userId: request.donation.donorProfile.userId,
        type: 'DISPUTE_RAISED',
        title: 'Delivery issue reported',
        message: `${request.ngoProfile.organisationName} reported a problem with "${request.donation.foodName}".`,
        link: donorLink(request.donationId),
      });
      await notifyAdmins(tx, {
        type: 'DISPUTE_RAISED',
        title: 'Delivery dispute',
        message: `${request.ngoProfile.organisationName} disputed the delivery of "${request.donation.foodName}": ${input.disputeReason}`,
        link: '/dashboard/admin/reports',
      });
      await audit(tx, { userId: actor.id, action: 'DELIVERY_DISPUTED', entity: 'FoodRequest', entityId: requestId, details: input.disputeReason });
      await refreshDonationStatus(tx, request.donationId);
      return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
    }

    const moved = await tx.foodRequest.updateMany({
      where: { id: requestId, status: 'DELIVERED' },
      data: {
        status: 'COMPLETED', completedAt: new Date(),
        feedbackRating: input.rating ?? null, feedbackComment: input.feedback ?? null,
      },
    });
    if (moved.count === 0) throw conflict('The request changed; reload and try again');
    const delivered = await completeDelivery(tx, request, request.deliveredQuantity ?? request.requestedQuantity);
    await refreshDonationStatus(tx, request.donationId);

    const feedback = input.rating ? ` Rating: ${input.rating}/5.${input.feedback ? ` “${input.feedback}”` : ''}` : '';
    await notify(tx, [
      {
        userId: request.donation.donorProfile.userId,
        type: 'RECEIPT_CONFIRMED',
        title: 'Food received',
        message: `${request.ngoProfile.organisationName} confirmed receiving "${request.donation.foodName}". Thank you!${feedback}`,
        link: donorLink(request.donationId),
      },
      ...(delivered?.volunteerProfile ? [{
        userId: delivered.volunteerProfile.userId,
        type: 'RECEIPT_CONFIRMED' as const,
        title: 'Delivery confirmed',
        message: `${request.ngoProfile.organisationName} confirmed your delivery of "${request.donation.foodName}".${feedback}`,
        link: volunteerLink(delivered.id),
      }] : []),
    ]);
    await audit(tx, { userId: actor.id, action: 'RECEIPT_CONFIRMED', entity: 'FoodRequest', entityId: requestId, details: input.rating ? `rating=${input.rating}` : undefined });
    return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
  });
}

/**
 * Admin resolves a delivery the NGO reported a problem with.
 *   VERIFY – the admin confirmed the food was delivered: request → COMPLETED and impact is recorded
 *            for the verified quantity (defaults to what the volunteer reported).
 *   CLOSE  – the delivery could not be verified: request stays DISPUTED, marked resolved, no impact.
 */
export async function resolveDispute(
  actor: Actor,
  requestId: string,
  input: { outcome: 'VERIFY' | 'CLOSE'; note: string; verifiedQuantity?: number }
) {
  if (actor.role !== 'ADMIN') throw forbidden();
  return transaction(async (tx) => {
    const request = await tx.foodRequest.findUnique({ where: { id: requestId }, include: requestWithParties });
    if (!request) throw notFound('Request not found');
    if (request.status !== 'DISPUTED' || request.disputeResolvedAt) {
      throw invalidTransition('Only open disputes can be resolved');
    }
    const now = new Date();
    const assignment = await tx.volunteerAssignment.findFirst({
      where: { requestId, status: 'DELIVERED' },
      include: { volunteerProfile: { select: { id: true, userId: true } } },
    });

    if (input.outcome === 'VERIFY') {
      const quantity = input.verifiedQuantity ?? request.deliveredQuantity ?? request.requestedQuantity;
      if (quantity > request.requestedQuantity) {
        throw badRequest(`Verified quantity cannot exceed the approved ${request.requestedQuantity}`, 'QUANTITY_EXCEEDS_APPROVED');
      }
      const moved = await tx.foodRequest.updateMany({
        where: { id: requestId, status: 'DISPUTED', disputeResolvedAt: null },
        data: {
          status: 'COMPLETED', completedAt: now, deliveredQuantity: quantity,
          disputeResolution: input.note, disputeResolvedAt: now,
        },
      });
      if (moved.count === 0) throw conflict('The dispute changed; reload and try again');
      await completeDelivery(tx, request, quantity);
    } else {
      const moved = await tx.foodRequest.updateMany({
        where: { id: requestId, status: 'DISPUTED', disputeResolvedAt: null },
        data: { disputeResolution: input.note, disputeResolvedAt: now },
      });
      if (moved.count === 0) throw conflict('The dispute changed; reload and try again');
    }
    await refreshDonationStatus(tx, request.donationId);

    const verdict = input.outcome === 'VERIFY'
      ? 'The delivery was verified and its impact recorded.'
      : 'The delivery could not be verified; no impact was recorded.';
    await notify(tx, [
      { userId: request.ngoProfile.userId, link: ngoLink(requestId) },
      { userId: request.donation.donorProfile.userId, link: donorLink(request.donationId) },
      ...(assignment?.volunteerProfile ? [{ userId: assignment.volunteerProfile.userId, link: volunteerLink(assignment.id) }] : []),
    ].map((n) => ({
      ...n,
      type: 'DISPUTE_RESOLVED' as const,
      title: 'Reported problem resolved',
      message: `"${request.donation.foodName}": ${verdict} Admin note: ${input.note}`,
    })));
    await audit(tx, {
      userId: actor.id,
      action: input.outcome === 'VERIFY' ? 'DISPUTE_VERIFIED' : 'DISPUTE_CLOSED',
      entity: 'FoodRequest',
      entityId: requestId,
      details: input.note,
    });
    return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
  });
}

// ─── Assignments ───

const assignmentWithParties = {
  volunteerProfile: { include: { user: { select: { id: true, name: true } } } },
  request: { include: requestWithParties },
} satisfies Prisma.VolunteerAssignmentInclude;

async function findAssignment(tx: Tx, assignmentId: string) {
  const assignment = await tx.volunteerAssignment.findUnique({ where: { id: assignmentId }, include: assignmentWithParties });
  if (!assignment) throw notFound('Assignment not found');
  return assignment;
}

async function findOwnAssignment(tx: Tx, actor: Actor, assignmentId: string) {
  const assignment = await tx.volunteerAssignment.findUnique({ where: { id: assignmentId }, include: assignmentWithParties });
  if (!assignment || assignment.volunteerProfile?.userId !== actor.id) throw notFound('Assignment not found');
  return assignment;
}

/**
 * Closes a not-yet-collected assignment (rejected, removed or volunteer suspended) and opens a new
 * PENDING assignment for the same request, so the delivery goes back to the volunteer pool.
 */
export async function releaseAssignment(
  tx: Tx,
  assignment: { id: string; requestId: string; status: AssignmentStatus },
  outcome: 'REJECTED' | 'CANCELLED',
  reason: string
) {
  const moved = await tx.volunteerAssignment.updateMany({
    where: { id: assignment.id, status: { in: RELEASABLE_ASSIGNMENT_STATUSES } },
    data: outcome === 'REJECTED' ? { status: 'REJECTED', rejectionReason: reason } : { status: 'CANCELLED', notes: reason },
  });
  if (moved.count === 0) return null;
  await tx.foodRequest.updateMany({
    where: { id: assignment.requestId, status: 'VOLUNTEER_ASSIGNED' },
    data: { status: 'ACCEPTED' },
  });
  return tx.volunteerAssignment.create({ data: { requestId: assignment.requestId, status: 'PENDING' } });
}

/** Admin offers an open (PENDING) assignment to a specific approved volunteer. */
export async function assignVolunteer(actor: Actor, input: { requestId?: string; assignmentId?: string; volunteerProfileId?: string }) {
  if (actor.role !== 'ADMIN') throw forbidden();
  if (!input.volunteerProfileId) throw badRequest('Choose a volunteer to assign');
  return transaction(async (tx) => {
    const volunteer = await tx.volunteerProfile.findUnique({
      where: { id: input.volunteerProfileId },
      include: { user: { select: { id: true, role: true, accountStatus: true, name: true } } },
    });
    if (!volunteer || volunteer.user.role !== 'VOLUNTEER' || volunteer.user.accountStatus !== 'APPROVED') {
      throw badRequest('That volunteer is not available for assignments', 'VOLUNTEER_UNAVAILABLE');
    }
    const open = await tx.volunteerAssignment.findFirst({
      where: input.assignmentId ? { id: input.assignmentId } : { requestId: input.requestId, status: 'PENDING' },
      include: assignmentWithParties,
    });
    if (!open) throw conflict('This delivery already has a volunteer or is not ready for one', 'ALREADY_ASSIGNED');
    const moved = await tx.volunteerAssignment.updateMany({
      where: { id: open.id, status: 'PENDING', volunteerProfileId: null },
      data: { status: 'ASSIGNED', volunteerProfileId: volunteer.id, assignedById: actor.id },
    });
    if (moved.count === 0) throw conflict('This delivery already has a volunteer or is not ready for one', 'ALREADY_ASSIGNED');

    await notify(tx, [
      {
        userId: volunteer.user.id,
        type: 'VOLUNTEER_ASSIGNED',
        title: 'New delivery assigned to you',
        message: `You were asked to deliver "${open.request.donation.foodName}" to ${open.request.ngoProfile.organisationName}. Please accept or reject.`,
        link: volunteerLink(open.id),
      },
      {
        userId: open.request.ngoProfile.userId,
        type: 'VOLUNTEER_ASSIGNED',
        title: 'Volunteer assigned',
        message: `${volunteer.user.name ?? 'A volunteer'} was assigned to collect "${open.request.donation.foodName}".`,
        link: ngoLink(open.requestId),
      },
    ]);
    await audit(tx, { userId: actor.id, action: 'VOLUNTEER_ASSIGNED', entity: 'VolunteerAssignment', entityId: open.id, details: `request=${open.requestId}` });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: open.id } });
  });
}

/** Volunteer accepts an open PENDING assignment, or one an admin offered them. First accept wins. */
export async function acceptAssignment(actor: Actor, input: { assignmentId?: string; requestId?: string }) {
  if (actor.role !== 'VOLUNTEER') throw forbidden();
  return transaction(async (tx) => {
    const own = await ensureVolunteerProfile(tx, actor.id);
    const target = await tx.volunteerAssignment.findFirst({
      where: input.assignmentId ? { id: input.assignmentId } : { requestId: input.requestId, status: { in: ['PENDING', 'ASSIGNED'] } },
      include: assignmentWithParties,
    });
    if (!target) throw input.assignmentId ? notFound('Assignment not found') : conflict('This delivery is not open', 'ALREADY_ASSIGNED');
    if (target.volunteerProfileId && target.volunteerProfileId !== own.id) {
      // Already held by someone else when we looked: hidden (404) when addressed by id, so other volunteers'
      // assignments cannot be probed; reported as taken (409) when claiming by request. A volunteer who
      // saw it open and lost the race at the conditional update below gets 409.
      throw input.assignmentId ? notFound('Assignment not found') : conflict('Another volunteer already has this delivery', 'ALREADY_ASSIGNED');
    }

    const now = new Date();
    let moved = await tx.volunteerAssignment.updateMany({
      where: { id: target.id, status: 'ASSIGNED', volunteerProfileId: own.id },
      data: { status: 'ACCEPTED', acceptedAt: now },
    });
    if (moved.count === 0) {
      moved = await tx.volunteerAssignment.updateMany({
        where: { id: target.id, status: 'PENDING', volunteerProfileId: null },
        data: { status: 'ACCEPTED', acceptedAt: now, volunteerProfileId: own.id },
      });
    }
    if (moved.count === 0) {
      throw target.volunteerProfileId === own.id
        ? invalidTransition(`A ${pretty(target.status)} assignment cannot be accepted`)
        : conflict('Another volunteer already accepted this delivery', 'ALREADY_ASSIGNED');
    }
    const req = await tx.foodRequest.updateMany({
      where: { id: target.requestId, status: 'ACCEPTED' },
      data: { status: 'VOLUNTEER_ASSIGNED' },
    });
    if (req.count === 0) throw conflict('This delivery is no longer open', 'ALREADY_ASSIGNED');

    await notify(tx, [
      { userId: target.request.donation.donorProfile.userId, link: donorLink(target.request.donationId) },
      { userId: target.request.ngoProfile.userId, link: ngoLink(target.requestId) },
    ].map((n) => ({
      ...n,
      type: 'VOLUNTEER_ASSIGNED' as const,
      title: 'Volunteer confirmed',
      message: `${actor.name ?? 'A volunteer'} will collect "${target.request.donation.foodName}" for ${target.request.ngoProfile.organisationName}.`,
    })));
    await audit(tx, { userId: actor.id, action: 'ASSIGNMENT_ACCEPTED', entity: 'VolunteerAssignment', entityId: target.id });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: target.id } });
  });
}

/** Volunteer rejects an offer or withdraws before pickup; the delivery reopens for other volunteers. */
export async function rejectAssignment(actor: Actor, assignmentId: string, reason?: string) {
  return transaction(async (tx) => {
    const a = await findOwnAssignment(tx, actor, assignmentId);
    const reopened = await releaseAssignment(tx, a, 'REJECTED', reason ?? 'Declined by the volunteer');
    if (!reopened) throw invalidTransition(`A ${pretty(a.status)} assignment cannot be rejected`);
    await announceAssignment(tx, reopened.id, a.request.donation);
    await notifyAdmins(tx, {
      type: 'VOLUNTEER_DECLINED',
      title: 'Volunteer declined a delivery',
      message: `${a.volunteerProfile?.user.name} declined "${a.request.donation.foodName}". It is open to other volunteers again.`,
      link: '/dashboard/admin/deliveries',
    });
    if (a.status !== 'ASSIGNED') {
      await notify(tx, [a.request.donation.donorProfile.userId, a.request.ngoProfile.userId].map((userId) => ({
        userId,
        type: 'ASSIGNMENT_CANCELLED' as const,
        title: 'Finding a new volunteer',
        message: `The volunteer for "${a.request.donation.foodName}" withdrew. The delivery is open to other volunteers.`,
      })));
    }
    await audit(tx, { userId: actor.id, action: 'ASSIGNMENT_REJECTED', entity: 'VolunteerAssignment', entityId: assignmentId, details: reason });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}

/** Admin removes a volunteer before pickup (or withdraws an offer); the delivery reopens. */
export async function cancelAssignment(actor: Actor, assignmentId: string, reason?: string) {
  if (actor.role !== 'ADMIN') throw forbidden();
  return transaction(async (tx) => {
    const a = await findAssignment(tx, assignmentId);
    const reopened = await releaseAssignment(tx, a, 'CANCELLED', reason ?? 'Removed by an admin');
    if (!reopened) throw invalidTransition('Only assignments that have not been picked up can be cancelled');
    if (a.volunteerProfile) {
      await notify(tx, {
        userId: a.volunteerProfile.user.id,
        type: 'ASSIGNMENT_CANCELLED',
        title: 'Assignment removed',
        message: `An admin removed you from the delivery of "${a.request.donation.foodName}".${reason ? ` Reason: ${reason}` : ''}`,
      });
    }
    await audit(tx, { userId: actor.id, action: 'ASSIGNMENT_CANCELLED', entity: 'VolunteerAssignment', entityId: assignmentId, details: reason });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}

type StepInput = { photoUrl?: string; notes?: string; deliveredQuantity?: number; reason?: string };

/**
 * Volunteer progress through the delivery. Each step only succeeds from its expected previous status.
 *   arrive:  ACCEPTED → PICKUP_IN_PROGRESS
 *   pickup:  ACCEPTED | PICKUP_IN_PROGRESS → PICKED_UP        (optional pickup proof photo)
 *   transit: PICKED_UP → IN_TRANSIT
 *   deliver: PICKED_UP | IN_TRANSIT → DELIVERED               (delivery proof photo required)
 *   fail:    PICKED_UP | IN_TRANSIT → CANCELLED, request cancelled (food cannot be re-offered)
 */
export async function advanceAssignment(actor: Actor, assignmentId: string, step: 'arrive' | 'pickup' | 'transit' | 'deliver' | 'fail', input: StepInput = {}) {
  return transaction(async (tx) => {
    const a = await findOwnAssignment(tx, actor, assignmentId);
    if (step === 'pickup') {
      if (!['ACCEPTED', 'PICKUP_IN_PROGRESS'].includes(a.status)) {
        throw invalidTransition(a.status === 'ASSIGNED' ? 'Accept the assignment before confirming pickup' : `A ${pretty(a.status)} assignment cannot be picked up`);
      }
      await assertOwnUpload(tx, input.photoUrl, actor.id, 'PICKUP_PROOF');
    }
    if (step === 'deliver') {
      if (!['PICKED_UP', 'IN_TRANSIT'].includes(a.status)) {
        throw invalidTransition(`Confirm pickup before delivery (assignment is ${pretty(a.status)})`);
      }
      if (!input.photoUrl) throw badRequest('Upload a delivery photo as proof', 'PROOF_REQUIRED');
      await assertOwnUpload(tx, input.photoUrl, actor.id, 'DELIVERY_PROOF');
    }
    const r = a.request;
    const now = new Date();
    const unit = r.donation.unit.toLowerCase();
    const parties = (link: boolean) => [
      { userId: r.donation.donorProfile.userId, link: link ? donorLink(r.donationId) : undefined },
      { userId: r.ngoProfile.userId, link: link ? ngoLink(r.id) : undefined },
    ];
    const move = async (from: AssignmentStatus[], data: Prisma.VolunteerAssignmentUpdateManyMutationInput, message: string) => {
      const moved = await tx.volunteerAssignment.updateMany({ where: { id: assignmentId, status: { in: from } }, data });
      if (moved.count === 0) throw invalidTransition(message);
    };
    const moveRequest = async (from: RequestStatus[], data: Prisma.FoodRequestUpdateManyMutationInput) => {
      const moved = await tx.foodRequest.updateMany({ where: { id: r.id, status: { in: from } }, data });
      if (moved.count === 0) throw conflict('The request changed; reload and try again');
    };

    switch (step) {
      case 'arrive':
        await move(['ACCEPTED'], { status: 'PICKUP_IN_PROGRESS', arrivedAt: now },
          a.status === 'ASSIGNED' ? 'Accept the assignment first' : `Cannot mark arrival on a ${pretty(a.status)} assignment`);
        await notify(tx, { userId: r.donation.donorProfile.userId, type: 'GENERAL', title: 'Volunteer has arrived', message: `${a.volunteerProfile?.user.name} has arrived to collect "${r.donation.foodName}".`, link: donorLink(r.donationId) });
        break;
      case 'pickup':
        await move(['ACCEPTED', 'PICKUP_IN_PROGRESS'], { status: 'PICKED_UP', pickupTime: now, pickupProofUrl: input.photoUrl ?? null },
          a.status === 'ASSIGNED' ? 'Accept the assignment before confirming pickup' : `A ${pretty(a.status)} assignment cannot be picked up`);
        await moveRequest(['VOLUNTEER_ASSIGNED'], { status: 'PICKED_UP', pickedUpAt: now });
        await tx.deliveryProof.create({ data: { requestId: r.id, type: 'PICKUP', photoUrl: input.photoUrl, notes: input.notes, submittedById: actor.id } });
        await notify(tx, parties(true).map((p) => ({ ...p, type: 'PICKUP_COMPLETED' as const, title: 'Food picked up', message: `${a.volunteerProfile?.user.name} collected "${r.donation.foodName}".` })));
        break;
      case 'transit':
        await move(['PICKED_UP'], { status: 'IN_TRANSIT', inTransitAt: now }, `A ${pretty(a.status)} assignment cannot be marked in transit`);
        await moveRequest(['PICKED_UP'], { status: 'IN_TRANSIT', inTransitAt: now });
        await notify(tx, parties(true).map((p) => ({ ...p, type: 'DELIVERY_IN_TRANSIT' as const, title: 'Food on the way', message: `"${r.donation.foodName}" is on its way to ${r.ngoProfile.organisationName}.` })));
        break;
      case 'deliver': {
        const quantity = input.deliveredQuantity ?? r.requestedQuantity;
        if (quantity > r.requestedQuantity) {
          throw badRequest(`Delivered quantity cannot exceed the approved ${r.requestedQuantity}`, 'QUANTITY_EXCEEDS_APPROVED');
        }
        await move(['PICKED_UP', 'IN_TRANSIT'], { status: 'DELIVERED', deliveryTime: now, deliveryProofUrl: input.photoUrl },
          `Confirm pickup before delivery (assignment is ${pretty(a.status)})`);
        await moveRequest(['PICKED_UP', 'IN_TRANSIT'], { status: 'DELIVERED', deliveredAt: now, deliveredQuantity: quantity });
        await tx.deliveryProof.create({ data: { requestId: r.id, type: 'DELIVERY', photoUrl: input.photoUrl, quantity, notes: input.notes, submittedById: actor.id } });
        await notify(tx, [
          { userId: r.ngoProfile.userId, type: 'DELIVERY_COMPLETED', title: 'Food delivered – please confirm', message: `${a.volunteerProfile?.user.name} delivered ${quantity} ${unit} of "${r.donation.foodName}". Please confirm receipt.`, link: ngoLink(r.id) },
          { userId: r.donation.donorProfile.userId, type: 'DELIVERY_COMPLETED', title: 'Food delivered', message: `"${r.donation.foodName}" was delivered to ${r.ngoProfile.organisationName}.`, link: donorLink(r.donationId) },
        ]);
        break;
      }
      case 'fail': {
        if (!input.reason || input.reason.trim().length < 5) throw badRequest('Describe what went wrong (at least 5 characters)');
        await move(['PICKED_UP', 'IN_TRANSIT'], { status: 'CANCELLED', notes: `Delivery failed: ${input.reason}` },
          'Only collected food can be reported as a failed delivery – reject the assignment instead');
        await moveRequest(['PICKED_UP', 'IN_TRANSIT'], { status: 'CANCELLED', rejectionReason: `Delivery failed: ${input.reason}` });
        await refreshDonationStatus(tx, r.donationId);
        await notify(tx, parties(true).map((p) => ({ ...p, type: 'DELIVERY_FAILED' as const, title: 'Delivery failed', message: `The delivery of "${r.donation.foodName}" could not be completed: ${input.reason}` })));
        await notifyAdmins(tx, { type: 'DELIVERY_FAILED', title: 'Delivery failed', message: `"${r.donation.foodName}" to ${r.ngoProfile.organisationName}: ${input.reason}`, link: '/dashboard/admin/deliveries' });
        break;
      }
    }
    await audit(tx, {
      userId: actor.id,
      action: { arrive: 'PICKUP_ARRIVED', pickup: 'PICKUP_CONFIRMED', transit: 'DELIVERY_IN_TRANSIT', deliver: 'DELIVERY_COMPLETED', fail: 'DELIVERY_FAILED' }[step],
      entity: 'VolunteerAssignment',
      entityId: assignmentId,
      details: input.reason,
    });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}
