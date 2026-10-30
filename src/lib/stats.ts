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
        where: { user: { accountStatus: 'APPROVED' }, assignments: { some: { status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERED'] } } } },
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
      openNow: openDonations,
      completed: completedDonations,
      byCategory: byCategory.map((c) => ({ category: c.foodCategory, count: c._count })),
    },
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
    prisma.volunteerAssignment.count({ where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'] } } }),
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
