import { Prisma, type AssignmentStatus, type DonationStatus, type RequestStatus } from '@prisma/client';
import type { Session } from 'next-auth';
import prisma from '@/lib/db';
import { badRequest, conflict, forbidden, notFound } from '@/lib/api';
import { audit, notify, notifyAdmins } from '@/lib/events';
import { calculateImpact } from '@/lib/matching';
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
 * rolls back with a 409, so double approvals, double assignments and over-allocation cannot happen.
 */

export type Actor = Session['user'];
type Tx = Prisma.TransactionClient;

export const OPEN_DONATION_STATUSES: DonationStatus[] = ['AVAILABLE', 'PARTIALLY_RESERVED'];
export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'];
const IN_TRANSIT_REQUEST_STATUSES: RequestStatus[] = ['VOLUNTEER_ASSIGNED', 'PICKED_UP', 'DELIVERED'];
const UNFINISHED_REQUEST_STATUSES: RequestStatus[] = ['PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'DELIVERED'];

const transaction = <T>(fn: (tx: Tx) => Promise<T>) =>
  prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000 });

function invalidTransition(message: string) {
  return conflict(message, 'INVALID_TRANSITION');
}

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

// ─── Profiles ───

async function requireDonorProfile(db: Tx | typeof prisma, userId: string) {
  const profile = await db.donorProfile.findUnique({ where: { userId } });
  if (!profile) throw conflict('Complete your donor profile first', 'PROFILE_INCOMPLETE');
  return profile;
}

async function requireNgoProfile(db: Tx | typeof prisma, userId: string) {
  const profile = await db.nGOProfile.findUnique({ where: { userId } });
  if (!profile) throw conflict('Complete your NGO profile first', 'PROFILE_INCOMPLETE');
  return profile;
}

/** Volunteer profiles have no required fields, so one is created on first use. */
export async function ensureVolunteerProfile(db: Tx | typeof prisma, userId: string) {
  return db.volunteerProfile.upsert({ where: { userId }, create: { userId }, update: {} });
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

export async function cancelDonation(actor: Actor, donationId: string) {
  return transaction(async (tx) => {
    const donation = await findOwnDonation(tx, actor, donationId);
    if (donation.status === 'COMPLETED' || donation.status === 'CANCELLED') {
      throw invalidTransition(`A ${donation.status.toLowerCase()} donation cannot be cancelled`);
    }
    const inTransit = await tx.foodRequest.count({
      where: { donationId, status: { in: IN_TRANSIT_REQUEST_STATUSES } },
    });
    if (inTransit > 0) throw invalidTransition('Food from this donation is already on its way and cannot be cancelled');

    const affected = await tx.foodRequest.findMany({
      where: { donationId, status: { in: ['PENDING', 'ACCEPTED'] } },
      select: { id: true, ngoProfile: { select: { userId: true } } },
    });
    await tx.foodRequest.updateMany({
      where: { donationId, status: { in: ['PENDING', 'ACCEPTED'] } },
      data: { status: 'CANCELLED', rejectionReason: 'The donor cancelled this donation' },
    });
    const updated = await tx.foodDonation.updateMany({
      where: { id: donationId, status: donation.status },
      data: { status: 'CANCELLED' },
    });
    if (updated.count === 0) throw conflict('The donation changed; reload and try again');

    await notify(tx, affected.map((r) => ({
      userId: r.ngoProfile.userId,
      type: 'DONATION_CANCELLED' as const,
      title: 'Donation cancelled',
      message: `"${donation.foodName}" was cancelled by the donor. Your request has been closed.`,
      link: ngoLink(r.id),
    })));
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

export async function approveRequest(actor: Actor, requestId: string) {
  return transaction(async (tx) => {
    const request = await findRequestForDonor(tx, actor, requestId);
    if (request.status !== 'PENDING') throw invalidTransition(`A ${request.status.toLowerCase()} request cannot be approved`);
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

    await notify(tx, {
      userId: request.ngoProfile.userId,
      type: 'REQUEST_APPROVED',
      title: 'Request approved',
      message: `${request.donation.donorProfile.organisationName} approved your request for "${request.donation.foodName}". A volunteer will be assigned.`,
      link: ngoLink(requestId),
    });
    await notifyAdmins(tx, {
      type: 'GENERAL',
      title: 'Delivery needs a volunteer',
      message: `${request.ngoProfile.organisationName}'s request for "${request.donation.foodName}" was approved and needs a volunteer.`,
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
    if (moved.count === 0) throw invalidTransition(`A ${request.status.toLowerCase()} request cannot be rejected`);
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

/** NGO withdraws a request that has not been picked up yet; reserved quantity is released. */
export async function cancelRequest(actor: Actor, requestId: string, reason?: string) {
  return transaction(async (tx) => {
    const request = await findRequestForNgo(tx, actor, requestId);
    if (!['PENDING', 'ACCEPTED', 'VOLUNTEER_ASSIGNED'].includes(request.status)) {
      throw invalidTransition(`A ${request.status.toLowerCase().replace('_', ' ')} request cannot be cancelled`);
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

    const active = await tx.volunteerAssignment.findMany({
      where: { requestId, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      include: { volunteerProfile: { select: { userId: true } } },
    });
    await tx.volunteerAssignment.updateMany({
      where: { requestId, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
      data: { status: 'CANCELLED' },
    });

    await notify(tx, [
      {
        userId: request.donation.donorProfile.userId,
        type: 'REQUEST_CANCELLED',
        title: 'Request withdrawn',
        message: `${request.ngoProfile.organisationName} withdrew its request for "${request.donation.foodName}".`,
        link: donorLink(request.donationId),
      },
      ...active.map((a) => ({
        userId: a.volunteerProfile.userId,
        type: 'REQUEST_CANCELLED' as const,
        title: 'Delivery cancelled',
        message: `The delivery of "${request.donation.foodName}" was cancelled by the NGO.`,
        link: volunteerLink(a.id),
      })),
    ]);
    await audit(tx, { userId: actor.id, action: 'REQUEST_CANCELLED', entity: 'FoodRequest', entityId: requestId, details: reason });
    return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
  });
}

/** NGO confirms receipt (records impact) or disputes the delivery. */
export async function confirmReceipt(
  actor: Actor,
  requestId: string,
  input: { outcome: 'CONFIRMED'; notes?: string } | { outcome: 'DISPUTED'; disputeReason: string }
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
        link: '/dashboard/admin/deliveries',
      });
      await audit(tx, { userId: actor.id, action: 'DELIVERY_DISPUTED', entity: 'FoodRequest', entityId: requestId, details: input.disputeReason });
      await refreshDonationStatus(tx, request.donationId);
      return tx.foodRequest.findUniqueOrThrow({ where: { id: requestId } });
    }

    const moved = await tx.foodRequest.updateMany({
      where: { id: requestId, status: 'DELIVERED' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (moved.count === 0) throw conflict('The request changed; reload and try again');

    const assignment = await tx.volunteerAssignment.findFirst({
      where: { requestId, status: 'DELIVERED' },
      select: { volunteerProfileId: true },
    });
    const quantity = request.deliveredQuantity ?? request.requestedQuantity;
    await tx.impactRecord.create({
      data: {
        requestId,
        donorProfileId: request.donation.donorProfileId,
        ngoProfileId: request.ngoProfileId,
        volunteerProfileId: assignment?.volunteerProfileId,
        ...calculateImpact(quantity, request.donation.unit),
      },
    });
    await refreshDonationStatus(tx, request.donationId);

    const volunteerUser = assignment
      ? await tx.volunteerProfile.findUnique({ where: { id: assignment.volunteerProfileId }, select: { userId: true } })
      : null;
    await notify(tx, [
      {
        userId: request.donation.donorProfile.userId,
        type: 'RECEIPT_CONFIRMED',
        title: 'Food received',
        message: `${request.ngoProfile.organisationName} confirmed receiving "${request.donation.foodName}". Thank you!`,
        link: donorLink(request.donationId),
      },
      ...(volunteerUser ? [{
        userId: volunteerUser.userId,
        type: 'RECEIPT_CONFIRMED' as const,
        title: 'Delivery confirmed',
        message: `${request.ngoProfile.organisationName} confirmed your delivery of "${request.donation.foodName}".`,
      }] : []),
    ]);
    await audit(tx, { userId: actor.id, action: 'RECEIPT_CONFIRMED', entity: 'FoodRequest', entityId: requestId });
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
      await tx.impactRecord.create({
        data: {
          requestId,
          donorProfileId: request.donation.donorProfileId,
          ngoProfileId: request.ngoProfileId,
          volunteerProfileId: assignment?.volunteerProfile.id,
          ...calculateImpact(quantity, request.donation.unit),
        },
      });
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
      ...(assignment ? [{ userId: assignment.volunteerProfile.userId, link: volunteerLink(assignment.id) }] : []),
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

export async function createAssignment(actor: Actor, input: { requestId: string; volunteerProfileId?: string }) {
  return transaction(async (tx) => {
    let volunteerProfileId: string;
    let status: AssignmentStatus;

    if (actor.role === 'ADMIN') {
      if (!input.volunteerProfileId) throw badRequest('Choose a volunteer to assign');
      const volunteer = await tx.volunteerProfile.findUnique({
        where: { id: input.volunteerProfileId },
        include: { user: { select: { role: true, accountStatus: true } } },
      });
      if (!volunteer || volunteer.user.role !== 'VOLUNTEER' || volunteer.user.accountStatus !== 'APPROVED') {
        throw badRequest('That volunteer is not available for assignments', 'VOLUNTEER_UNAVAILABLE');
      }
      volunteerProfileId = volunteer.id;
      status = 'ASSIGNED';
    } else if (actor.role === 'VOLUNTEER') {
      const own = await ensureVolunteerProfile(tx, actor.id);
      if (input.volunteerProfileId && input.volunteerProfileId !== own.id) {
        throw forbidden('Volunteers can only claim deliveries for themselves');
      }
      volunteerProfileId = own.id;
      status = 'ACCEPTED';
    } else {
      throw forbidden();
    }

    const request = await tx.foodRequest.findUnique({ where: { id: input.requestId }, include: requestWithParties });
    if (!request) throw notFound('Request not found');

    // Only one active assignment per request: the request leaves ACCEPTED exactly once.
    const moved = await tx.foodRequest.updateMany({
      where: { id: request.id, status: 'ACCEPTED' },
      data: { status: 'VOLUNTEER_ASSIGNED' },
    });
    if (moved.count === 0) {
      throw conflict('This delivery already has a volunteer or is not ready for one', 'ALREADY_ASSIGNED');
    }
    const assignment = await tx.volunteerAssignment.create({
      data: {
        requestId: request.id,
        volunteerProfileId,
        status,
        assignedById: actor.role === 'ADMIN' ? actor.id : null,
        acceptedAt: status === 'ACCEPTED' ? new Date() : null,
      },
      include: { volunteerProfile: { include: { user: { select: { id: true, name: true } } } } },
    });

    const volunteerName = assignment.volunteerProfile.user.name;
    await notify(tx, [
      ...(status === 'ASSIGNED' ? [{
        userId: assignment.volunteerProfile.user.id,
        type: 'VOLUNTEER_ASSIGNED' as const,
        title: 'New delivery assigned',
        message: `You were assigned to deliver "${request.donation.foodName}" to ${request.ngoProfile.organisationName}. Please accept or decline.`,
        link: volunteerLink(assignment.id),
      }] : []),
      {
        userId: request.donation.donorProfile.userId,
        type: 'VOLUNTEER_ASSIGNED',
        title: 'Volunteer assigned',
        message: `${volunteerName} will collect "${request.donation.foodName}" for ${request.ngoProfile.organisationName}.`,
        link: donorLink(request.donationId),
      },
      {
        userId: request.ngoProfile.userId,
        type: 'VOLUNTEER_ASSIGNED',
        title: 'Volunteer assigned',
        message: `${volunteerName} will deliver "${request.donation.foodName}" to you.`,
        link: ngoLink(request.id),
      },
    ]);
    await audit(tx, {
      userId: actor.id,
      action: status === 'ASSIGNED' ? 'VOLUNTEER_ASSIGNED' : 'DELIVERY_CLAIMED',
      entity: 'VolunteerAssignment',
      entityId: assignment.id,
      details: `request=${request.id}`,
    });
    return assignment;
  });
}

async function findOwnAssignment(tx: Tx, actor: Actor, assignmentId: string) {
  const assignment = await tx.volunteerAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      volunteerProfile: { include: { user: { select: { id: true, name: true } } } },
      request: { include: requestWithParties },
    },
  });
  if (!assignment || assignment.volunteerProfile.userId !== actor.id) throw notFound('Assignment not found');
  return assignment;
}

export async function acceptAssignment(actor: Actor, assignmentId: string) {
  return transaction(async (tx) => {
    const a = await findOwnAssignment(tx, actor, assignmentId);
    const moved = await tx.volunteerAssignment.updateMany({
      where: { id: assignmentId, status: 'ASSIGNED' },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (moved.count === 0) throw invalidTransition(`A ${a.status.toLowerCase()} assignment cannot be accepted`);
    await notify(tx, [a.request.donation.donorProfile.userId, a.request.ngoProfile.userId].map((userId) => ({
      userId,
      type: 'VOLUNTEER_ACCEPTED' as const,
      title: 'Volunteer confirmed',
      message: `${a.volunteerProfile.user.name} accepted the delivery of "${a.request.donation.foodName}".`,
    })));
    await audit(tx, { userId: actor.id, action: 'ASSIGNMENT_ACCEPTED', entity: 'VolunteerAssignment', entityId: assignmentId });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}

/** Volunteer declines or withdraws before pickup; the delivery goes back to the volunteer pool. */
export async function declineAssignment(actor: Actor, assignmentId: string, reason?: string) {
  return transaction(async (tx) => {
    const a = await findOwnAssignment(tx, actor, assignmentId);
    const moved = await tx.volunteerAssignment.updateMany({
      where: { id: assignmentId, status: { in: ['ASSIGNED', 'ACCEPTED'] } },
      data: { status: 'DECLINED', notes: reason ?? null },
    });
    if (moved.count === 0) throw invalidTransition(`A ${a.status.toLowerCase().replace('_', ' ')} assignment cannot be declined`);
    await tx.foodRequest.updateMany({
      where: { id: a.requestId, status: 'VOLUNTEER_ASSIGNED' },
      data: { status: 'ACCEPTED' },
    });
    await notifyAdmins(tx, {
      type: 'VOLUNTEER_DECLINED',
      title: 'Volunteer declined a delivery',
      message: `${a.volunteerProfile.user.name} declined "${a.request.donation.foodName}". It needs a new volunteer.`,
      link: '/dashboard/admin/deliveries',
    });
    await audit(tx, { userId: actor.id, action: 'ASSIGNMENT_DECLINED', entity: 'VolunteerAssignment', entityId: assignmentId, details: reason });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}

/** Admin removes a volunteer who cannot complete an assignment (before pickup). */
export async function cancelAssignment(actor: Actor, assignmentId: string, reason?: string) {
  if (actor.role !== 'ADMIN') throw forbidden();
  return transaction(async (tx) => {
    const a = await tx.volunteerAssignment.findUnique({
      where: { id: assignmentId },
      include: { volunteerProfile: { select: { userId: true } }, request: { include: requestWithParties } },
    });
    if (!a) throw notFound('Assignment not found');
    const moved = await tx.volunteerAssignment.updateMany({
      where: { id: assignmentId, status: { in: ['ASSIGNED', 'ACCEPTED'] } },
      data: { status: 'CANCELLED', notes: reason ?? null },
    });
    if (moved.count === 0) throw invalidTransition('Only assignments that have not been picked up can be cancelled');
    await tx.foodRequest.updateMany({
      where: { id: a.requestId, status: 'VOLUNTEER_ASSIGNED' },
      data: { status: 'ACCEPTED' },
    });
    await notify(tx, {
      userId: a.volunteerProfile.userId,
      type: 'GENERAL',
      title: 'Assignment removed',
      message: `An admin removed you from the delivery of "${a.request.donation.foodName}".`,
    });
    await audit(tx, { userId: actor.id, action: 'ASSIGNMENT_CANCELLED', entity: 'VolunteerAssignment', entityId: assignmentId, details: reason });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}

export async function markPickedUp(actor: Actor, assignmentId: string, input: { photoUrl?: string; notes?: string }) {
  return transaction(async (tx) => {
    const a = await findOwnAssignment(tx, actor, assignmentId);
    const now = new Date();
    const moved = await tx.volunteerAssignment.updateMany({
      where: { id: assignmentId, status: 'ACCEPTED' },
      data: { status: 'PICKED_UP', pickupTime: now, pickupProofUrl: input.photoUrl ?? null },
    });
    if (moved.count === 0) {
      throw invalidTransition(a.status === 'ASSIGNED'
        ? 'Accept the assignment before confirming pickup'
        : `A ${a.status.toLowerCase().replace('_', ' ')} assignment cannot be picked up`);
    }
    const req = await tx.foodRequest.updateMany({
      where: { id: a.requestId, status: 'VOLUNTEER_ASSIGNED' },
      data: { status: 'PICKED_UP', pickedUpAt: now },
    });
    if (req.count === 0) throw conflict('The request changed; reload and try again');
    await tx.deliveryProof.create({
      data: { requestId: a.requestId, type: 'PICKUP', photoUrl: input.photoUrl, notes: input.notes, submittedById: actor.id },
    });
    await notify(tx, [
      { userId: a.request.donation.donorProfile.userId, link: donorLink(a.request.donationId) },
      { userId: a.request.ngoProfile.userId, link: ngoLink(a.requestId) },
    ].map((n) => ({
      ...n,
      type: 'PICKUP_COMPLETED' as const,
      title: 'Food picked up',
      message: `${a.volunteerProfile.user.name} picked up "${a.request.donation.foodName}" and is on the way.`,
    })));
    await audit(tx, { userId: actor.id, action: 'PICKUP_CONFIRMED', entity: 'VolunteerAssignment', entityId: assignmentId });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}

export async function markDelivered(
  actor: Actor,
  assignmentId: string,
  input: { photoUrl: string; deliveredQuantity: number; notes?: string }
) {
  return transaction(async (tx) => {
    const a = await findOwnAssignment(tx, actor, assignmentId);
    if (input.deliveredQuantity > a.request.requestedQuantity) {
      throw badRequest(`Delivered quantity cannot exceed the approved ${a.request.requestedQuantity}`, 'QUANTITY_EXCEEDS_APPROVED');
    }
    const now = new Date();
    const moved = await tx.volunteerAssignment.updateMany({
      where: { id: assignmentId, status: 'PICKED_UP' },
      data: { status: 'DELIVERED', deliveryTime: now, deliveryProofUrl: input.photoUrl },
    });
    if (moved.count === 0) {
      throw invalidTransition(`Confirm pickup before delivery (assignment is ${a.status.toLowerCase().replace('_', ' ')})`);
    }
    const req = await tx.foodRequest.updateMany({
      where: { id: a.requestId, status: 'PICKED_UP' },
      data: { status: 'DELIVERED', deliveredAt: now, deliveredQuantity: input.deliveredQuantity },
    });
    if (req.count === 0) throw conflict('The request changed; reload and try again');
    await tx.deliveryProof.create({
      data: {
        requestId: a.requestId, type: 'DELIVERY', photoUrl: input.photoUrl,
        quantity: input.deliveredQuantity, notes: input.notes, submittedById: actor.id,
      },
    });
    await notify(tx, [
      {
        userId: a.request.ngoProfile.userId,
        type: 'DELIVERY_COMPLETED',
        title: 'Food delivered – please confirm',
        message: `${a.volunteerProfile.user.name} delivered ${input.deliveredQuantity} ${a.request.donation.unit.toLowerCase()} of "${a.request.donation.foodName}". Please confirm receipt.`,
        link: ngoLink(a.requestId),
      },
      {
        userId: a.request.donation.donorProfile.userId,
        type: 'DELIVERY_COMPLETED',
        title: 'Food delivered',
        message: `"${a.request.donation.foodName}" was delivered to ${a.request.ngoProfile.organisationName}.`,
        link: donorLink(a.request.donationId),
      },
    ]);
    await audit(tx, { userId: actor.id, action: 'DELIVERY_COMPLETED', entity: 'VolunteerAssignment', entityId: assignmentId });
    return tx.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
  });
}
