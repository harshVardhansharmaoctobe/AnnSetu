import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { IMPACT_ESTIMATES } from '@/lib/matching';

/**
 * Impact and platform statistics, computed from database records only.
 *
 * Three kinds of figures are kept apart:
 *  - Verified records: counts/quantities from deliveries the receiving NGO confirmed (or an admin
 *    verified after a reported problem). Unconfirmed deliveries are reported separately, never mixed in.
 *  - Estimates: meals, weight, CO2 and water from ImpactRecord rows (verified deliveries only),
 *    using the conversion factors in IMPACT_ESTIMATES.
 *  - Demo data: the share of the above that comes from seeded demo accounts (User.isDemo).
 */

type UnitTotals = { MEALS: number; KG: number };
type Units = UnitTotals;
const emptyUnits = (): UnitTotals => ({ MEALS: 0, KG: 0 });
const r2 = (n: number | null | undefined) => Math.round((n ?? 0) * 100) / 100;

export type ImpactScope =
  | { kind: 'platform' }
  | { kind: 'donor'; donorProfileId: string }
  | { kind: 'ngo'; ngoProfileId: string }
  | { kind: 'volunteer'; volunteerProfileId: string };

function sumByUnit(rows: { deliveredQuantity: number | null; requestedQuantity: number; donation: { unit: 'MEALS' | 'KG' } }[]) {
  const totals = emptyUnits();
  for (const row of rows) totals[row.donation.unit] += row.deliveredQuantity ?? row.requestedQuantity;
  return { MEALS: r2(totals.MEALS), KG: r2(totals.KG) };
}

export async function getImpactStats(scope: ImpactScope = { kind: 'platform' }) {
  const impactWhere: Prisma.ImpactRecordWhereInput =
    scope.kind === 'donor' ? { donorProfileId: scope.donorProfileId }
      : scope.kind === 'ngo' ? { ngoProfileId: scope.ngoProfileId }
        : scope.kind === 'volunteer' ? { volunteerProfileId: scope.volunteerProfileId }
          : {};
  const donationWhere: Prisma.FoodDonationWhereInput =
    scope.kind === 'donor' ? { donorProfileId: scope.donorProfileId } : {};
  const requestWhere: Prisma.FoodRequestWhereInput =
    scope.kind === 'donor' ? { donation: { donorProfileId: scope.donorProfileId } }
      : scope.kind === 'ngo' ? { ngoProfileId: scope.ngoProfileId }
        : scope.kind === 'volunteer'
          ? { assignments: { some: { volunteerProfileId: scope.volunteerProfileId, status: 'DELIVERED' } } }
          : {};
  const listed: Prisma.FoodDonationWhereInput = { ...donationWhere, status: { not: 'CANCELLED' } };
  const deliveredSelect = { deliveredQuantity: true, requestedQuantity: true, donation: { select: { unit: true } } } as const;

  const [impact, donationCount, listedByUnit, openDonations, completedDonations, verifiedRows, awaitingRows, openDisputes, byCategory] =
    await Promise.all([
      prisma.impactRecord.aggregate({
        where: impactWhere,
        _sum: { mealsRescued: true, weightKg: true, co2SavedKg: true, waterSavedLiters: true },
        _count: true,
      }),
      prisma.foodDonation.count({ where: listed }),
      prisma.foodDonation.groupBy({ by: ['unit'], where: listed, _sum: { quantity: true } }),
      prisma.foodDonation.count({
        where: { ...donationWhere, status: { in: ['AVAILABLE', 'PARTIALLY_RESERVED'] }, safePickupDeadline: { gt: new Date() } },
      }),
      prisma.foodDonation.count({ where: { ...donationWhere, status: 'COMPLETED' } }),
      prisma.foodRequest.findMany({ where: { ...requestWhere, status: 'COMPLETED' }, select: deliveredSelect, take: 10_000 }),
      prisma.foodRequest.findMany({ where: { ...requestWhere, status: 'DELIVERED' }, select: deliveredSelect, take: 10_000 }),
      prisma.foodRequest.count({ where: { ...requestWhere, status: 'DISPUTED', disputeResolvedAt: null } }),
      prisma.foodDonation.groupBy({
        by: ['foodCategory'],
        where: listed,
        _count: true,
        orderBy: { _count: { foodCategory: 'desc' } },
      }),
    ]);

  const now = new Date();
  const [availableByUnit, reservedRows, pendingRequests, approvedFinal, verifiedByCategory] = await Promise.all([
    // Available: unreserved quantity on open, unexpired listings.
    prisma.foodDonation.groupBy({
      by: ['unit'],
      where: { ...donationWhere, status: { in: ['AVAILABLE', 'PARTIALLY_RESERVED'] }, safePickupDeadline: { gt: now } },
      _sum: { remainingQuantity: true },
    }),
    // Reserved: approved for an NGO but not yet verified as received.
    prisma.foodRequest.findMany({
      where: { ...requestWhere, status: { in: ['ACCEPTED', 'VOLUNTEER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] } },
      select: deliveredSelect,
      take: 10_000,
    }),
    prisma.foodRequest.count({ where: { ...requestWhere, status: 'PENDING' } }),
    // Approved requests that reached a final outcome: delivered and confirmed, or not delivered.
    prisma.foodRequest.groupBy({
      by: ['status'],
      where: {
        ...requestWhere,
        approvedAt: { not: null },
        OR: [{ status: { in: ['COMPLETED', 'CANCELLED'] } }, { status: 'DISPUTED', disputeResolvedAt: { not: null } }],
      },
      _count: true,
    }),
    prisma.foodRequest.findMany({
      where: { ...requestWhere, status: 'COMPLETED' },
      select: { deliveredQuantity: true, requestedQuantity: true, donation: { select: { unit: true, foodCategory: true } } },
      take: 10_000,
    }),
  ]);
  const quantityAvailable = emptyUnits();
  for (const row of availableByUnit) quantityAvailable[row.unit] = r2(row._sum.remainingQuantity);
  const finalCounts = Object.fromEntries(approvedFinal.map((g) => [g.status, g._count])) as Record<string, number>;
  const finalTotal = (finalCounts.COMPLETED ?? 0) + (finalCounts.CANCELLED ?? 0) + (finalCounts.DISPUTED ?? 0);
  const recovered = new Map<string, Units>();
  for (const row of verifiedByCategory) {
    const entry = recovered.get(row.donation.foodCategory) ?? emptyUnits();
    entry[row.donation.unit] = r2(entry[row.donation.unit] + (row.deliveredQuantity ?? row.requestedQuantity));
    recovered.set(row.donation.foodCategory, entry);
  }

  const quantityListed = emptyUnits();
  for (const row of listedByUnit) quantityListed[row.unit] = r2(row._sum.quantity);
  const quantityVerified = sumByUnit(verifiedRows);
  const rate = (u: keyof UnitTotals) => (quantityListed[u] > 0 ? r2((quantityVerified[u] / quantityListed[u]) * 100) : null);

  let participants = null;
  let demo = null;
  if (scope.kind === 'platform') {
    const demoDonor = { donorProfile: { user: { isDemo: true } } } satisfies Prisma.FoodDonationWhereInput;
    const [activeVolunteers, participatingNgos, activeDonors, volunteerVerifiedDeliveries, demoDonations, demoImpact] = await Promise.all([
      prisma.volunteerProfile.count({
        where: { user: { accountStatus: 'APPROVED' }, assignments: { some: { status: { in: ['ACCEPTED', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'] } } } },
      }),
      prisma.nGOProfile.count({
        where: { user: { accountStatus: 'APPROVED' }, requests: { some: { status: { notIn: ['CANCELLED'] } } } },
      }),
      prisma.donorProfile.count({ where: { user: { accountStatus: 'APPROVED' }, donations: { some: {} } } }),
      prisma.impactRecord.count({ where: { volunteerProfileId: { not: null } } }),
      prisma.foodDonation.count({ where: { ...listed, ...demoDonor } }),
      prisma.impactRecord.aggregate({
        where: { request: { donation: demoDonor } },
        _sum: { mealsRescued: true },
        _count: true,
      }),
    ]);
    participants = { activeVolunteers, participatingNgos, activeDonors, volunteerVerifiedDeliveries };
    demo = {
      donations: demoDonations,
      verifiedDeliveries: demoImpact._count,
      mealsServed: r2(demoImpact._sum.mealsRescued),
      note: 'Records created by the seeded demo accounts (prisma/seed.ts). They are included in the totals above.',
    };
  }

  return {
    scope: scope.kind,
    donations: {
      total: donationCount,
      quantityListed,
      quantityAvailable,
      quantityReserved: sumByUnit(reservedRows),
      openNow: openDonations,
      completed: completedDonations,
      byCategory: byCategory.map((c) => ({ category: c.foodCategory, count: c._count })),
    },
    requests: {
      pending: pendingRequests,
      // Of approved requests that reached a final outcome, the share delivered and confirmed.
      deliveryCompletionRatePercent: finalTotal > 0 ? r2(((finalCounts.COMPLETED ?? 0) / finalTotal) * 100) : null,
      approvedFinalOutcomes: finalTotal,
    },
    recoveredByCategory: [...recovered.entries()].map(([category, quantity]) => ({ category, quantity })),
    deliveries: {
      // Verified = confirmed by the receiving NGO (or verified by an admin after a reported problem).
      completed: verifiedRows.length,
      quantityVerified,
      awaitingConfirmation: awaitingRows.length,
      quantityAwaitingConfirmation: sumByUnit(awaitingRows),
      openDisputes,
      recoveryRatePercent: { MEALS: rate('MEALS'), KG: rate('KG') },
    },
    participants,
    demo,
    estimates: {
      confirmedDeliveries: impact._count,
      mealsServed: r2(impact._sum.mealsRescued),
      foodWastePreventedKg: r2(impact._sum.weightKg),
      co2SavedKg: r2(impact._sum.co2SavedKg),
      waterSavedLiters: r2(impact._sum.waterSavedLiters),
      assumptions: {
        mealsPerKg: IMPACT_ESTIMATES.mealsPerKg,
        co2KgPerKgFood: IMPACT_ESTIMATES.co2PerKg,
        waterLitersPerKgFood: IMPACT_ESTIMATES.waterPerKg,
        note: 'Estimates count verified deliveries only. Quantities entered in meals are converted to kg (and vice versa) with mealsPerKg.',
      },
    },
  };
}

export async function getAdminStats() {
  const [usersByRoleStatus, donationsByStatus, requestsByStatus, activeAssignments, unassigned, openDisputes] = await Promise.all([
    prisma.user.groupBy({ by: ['role', 'accountStatus'], _count: true }),
    prisma.foodDonation.groupBy({ by: ['status'], _count: true }),
    prisma.foodRequest.groupBy({ by: ['status'], _count: true }),
    prisma.volunteerAssignment.count({ where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKUP_IN_PROGRESS', 'PICKED_UP', 'IN_TRANSIT'] } } }),
    prisma.foodRequest.count({ where: { status: 'ACCEPTED' } }),
    prisma.foodRequest.count({ where: { status: 'DISPUTED', disputeResolvedAt: null } }),
  ]);
  const users = { total: 0, pending: 0, byRole: {} as Record<string, number>, byStatus: {} as Record<string, number> };
  for (const row of usersByRoleStatus) {
    users.total += row._count;
    users.byRole[row.role] = (users.byRole[row.role] ?? 0) + row._count;
    users.byStatus[row.accountStatus] = (users.byStatus[row.accountStatus] ?? 0) + row._count;
  }
  users.pending = users.byStatus.PENDING ?? 0;
  return {
    users,
    donationsByStatus: Object.fromEntries(donationsByStatus.map((d) => [d.status, d._count])),
    requestsByStatus: Object.fromEntries(requestsByStatus.map((r) => [r.status, r._count])),
    activeAssignments,
    awaitingVolunteer: unassigned,
    openDisputes,
  };
}

// ─── Trends and analytics ───

export type TrendInterval = 'day' | 'week' | 'month';
const DAY_MS = 86_400_000;

function bucketStart(d: Date, interval: TrendInterval): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (interval === 'week') x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // Monday
  if (interval === 'month') x.setUTCDate(1);
  return x;
}
const bucketKey = (d: Date, interval: TrendInterval) =>
  interval === 'month' ? bucketStart(d, interval).toISOString().slice(0, 7) : bucketStart(d, interval).toISOString().slice(0, 10);

function nextBucket(d: Date, interval: TrendInterval) {
  const x = new Date(d);
  if (interval === 'day') x.setUTCDate(x.getUTCDate() + 1);
  else if (interval === 'week') x.setUTCDate(x.getUTCDate() + 7);
  else x.setUTCMonth(x.getUTCMonth() + 1);
  return x;
}

/** Default ranges: 30 days by day, 12 weeks by week, 12 months by month. Ranges are capped at 366 days. */
export function normaliseRange(input: { from?: Date; to?: Date; interval?: TrendInterval }) {
  const interval = input.interval ?? 'day';
  const to = input.to ?? new Date();
  const span = interval === 'day' ? 30 * DAY_MS : interval === 'week' ? 84 * DAY_MS : 365 * DAY_MS;
  let from = input.from ?? new Date(to.getTime() - span);
  if (to.getTime() - from.getTime() > 366 * DAY_MS) from = new Date(to.getTime() - 366 * DAY_MS);
  return { from, to, interval };
}

/** Listings (by creation date) and verified deliveries (by confirmation date) per period. */
export async function getTrends(range: { from: Date; to: Date; interval: TrendInterval }) {
  const [listed, verified] = await Promise.all([
    prisma.foodDonation.findMany({
      where: { createdAt: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      select: { createdAt: true, quantity: true, unit: true },
      take: 10_000,
    }),
    prisma.foodRequest.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: range.from, lte: range.to } },
      select: { completedAt: true, deliveredQuantity: true, requestedQuantity: true, donation: { select: { unit: true } } },
      take: 10_000,
    }),
  ]);
  const buckets = new Map<string, { period: string; donationsListed: number; listed: Units; verifiedDeliveries: number; delivered: Units }>();
  for (let d = bucketStart(range.from, range.interval); d <= range.to && buckets.size < 400; d = nextBucket(d, range.interval)) {
    const key = bucketKey(d, range.interval);
    buckets.set(key, { period: key, donationsListed: 0, listed: emptyUnits(), verifiedDeliveries: 0, delivered: emptyUnits() });
  }
  for (const d of listed) {
    const b = buckets.get(bucketKey(d.createdAt, range.interval));
    if (b) { b.donationsListed += 1; b.listed[d.unit] = r2(b.listed[d.unit] + d.quantity); }
  }
  for (const r of verified) {
    const b = r.completedAt && buckets.get(bucketKey(r.completedAt, range.interval));
    if (b) { b.verifiedDeliveries += 1; b.delivered[r.donation.unit] = r2(b.delivered[r.donation.unit] + (r.deliveredQuantity ?? r.requestedQuantity)); }
  }
  return [...buckets.values()];
}

/** Admin reports for a date range: donations, deliveries, users and food recovery. */
export async function getAnalytics(range: { from: Date; to: Date; interval: TrendInterval }) {
  const created = { gte: range.from, lte: range.to };
  const [trends, donationsByStatus, requestsByStatus, newUsers, verified, assignmentsByStatus] = await Promise.all([
    getTrends(range),
    prisma.foodDonation.groupBy({ by: ['status'], where: { createdAt: created }, _count: true, _sum: { quantity: true } }),
    prisma.foodRequest.groupBy({ by: ['status'], where: { createdAt: created }, _count: true, _sum: { requestedQuantity: true } }),
    prisma.user.groupBy({ by: ['role', 'accountStatus'], where: { createdAt: created }, _count: true }),
    prisma.foodRequest.findMany({
      where: { status: 'COMPLETED', completedAt: created },
      select: { deliveredQuantity: true, requestedQuantity: true, donation: { select: { unit: true, foodCategory: true } } },
      take: 10_000,
    }),
    prisma.volunteerAssignment.groupBy({ by: ['status'], where: { createdAt: created }, _count: true }),
  ]);
  const recovered = new Map<string, Units>();
  for (const row of verified) {
    const entry = recovered.get(row.donation.foodCategory) ?? emptyUnits();
    entry[row.donation.unit] = r2(entry[row.donation.unit] + (row.deliveredQuantity ?? row.requestedQuantity));
    recovered.set(row.donation.foodCategory, entry);
  }
  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), interval: range.interval },
    trends,
    donations: donationsByStatus.map((d) => ({ status: d.status, count: d._count, quantity: r2(d._sum.quantity) })),
    requests: requestsByStatus.map((r) => ({ status: r.status, count: r._count, quantity: r2(r._sum.requestedQuantity) })),
    assignments: assignmentsByStatus.map((a) => ({ status: a.status, count: a._count })),
    newUsers: newUsers.map((u) => ({ role: u.role, status: u.accountStatus, count: u._count })),
    recoveredByCategory: [...recovered.entries()].map(([category, quantity]) => ({ category, quantity })),
    verifiedDeliveries: verified.length,
  };
}
