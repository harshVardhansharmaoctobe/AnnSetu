import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { IMPACT_ESTIMATES } from '@/lib/matching';

/**
 * Impact and platform statistics, computed from database records only.
 *
 * "Estimated" figures (meals, weight, CO2, water) come from ImpactRecord rows, which are written
 * when an NGO confirms receipt, using the conversion factors in IMPACT_ESTIMATES.
 */

type UnitTotals = { MEALS: number; KG: number };
const emptyUnits = (): UnitTotals => ({ MEALS: 0, KG: 0 });
const r2 = (n: number | null | undefined) => Math.round((n ?? 0) * 100) / 100;

export type ImpactScope =
  | { kind: 'platform' }
  | { kind: 'donor'; donorProfileId: string }
  | { kind: 'ngo'; ngoProfileId: string }
  | { kind: 'volunteer'; volunteerProfileId: string };

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
          ? { assignments: { some: { volunteerProfileId: scope.volunteerProfileId, status: { in: ['DELIVERED'] } } } }
          : {};

  const [impact, donationCount, donatedByUnit, openDonations, completedDeliveries, awaitingConfirmation, deliveredRows, byCategory] =
    await Promise.all([
      prisma.impactRecord.aggregate({
        where: impactWhere,
        _sum: { mealsRescued: true, weightKg: true, co2SavedKg: true, waterSavedLiters: true },
        _count: true,
      }),
      prisma.foodDonation.count({ where: { ...donationWhere, status: { not: 'CANCELLED' } } }),
      prisma.foodDonation.groupBy({
        by: ['unit'],
        where: { ...donationWhere, status: { not: 'CANCELLED' } },
        _sum: { quantity: true },
      }),
      prisma.foodDonation.count({
        where: { ...donationWhere, status: { in: ['AVAILABLE', 'PARTIALLY_RESERVED'] }, safePickupDeadline: { gt: new Date() } },
      }),
      prisma.foodRequest.count({ where: { ...requestWhere, status: 'COMPLETED' } }),
      prisma.foodRequest.count({ where: { ...requestWhere, status: 'DELIVERED' } }),
      prisma.foodRequest.findMany({
        where: { ...requestWhere, status: { in: ['DELIVERED', 'COMPLETED'] } },
        select: { deliveredQuantity: true, requestedQuantity: true, donation: { select: { unit: true } } },
        take: 10_000,
      }),
      prisma.foodDonation.groupBy({
        by: ['foodCategory'],
        where: { ...donationWhere, status: { not: 'CANCELLED' } },
        _count: true,
        orderBy: { _count: { foodCategory: 'desc' } },
      }),
    ]);

  const donated = emptyUnits();
  for (const row of donatedByUnit) donated[row.unit] = r2(row._sum.quantity);
  const delivered = emptyUnits();
  for (const row of deliveredRows) delivered[row.donation.unit] += row.deliveredQuantity ?? row.requestedQuantity;
  delivered.MEALS = r2(delivered.MEALS);
  delivered.KG = r2(delivered.KG);

  const platformOnly = scope.kind === 'platform'
    ? await Promise.all([
      prisma.volunteerProfile.count({
        where: {
          user: { accountStatus: 'APPROVED' },
          assignments: { some: { status: { in: ['ACCEPTED', 'PICKED_UP', 'DELIVERED'] } } },
        },
      }),
      prisma.nGOProfile.count({
        where: { user: { accountStatus: 'APPROVED' }, requests: { some: { status: { notIn: ['CANCELLED'] } } } },
      }),
      prisma.donorProfile.count({ where: { user: { accountStatus: 'APPROVED' }, donations: { some: {} } } }),
    ])
    : null;

  return {
    scope: scope.kind,
    donations: {
      total: donationCount,
      quantityDonated: donated,
      openNow: openDonations,
      byCategory: byCategory.map((c) => ({ category: c.foodCategory, count: c._count })),
    },
    deliveries: {
      completed: completedDeliveries,
      awaitingConfirmation,
      quantityDelivered: delivered,
    },
    participants: platformOnly && {
      activeVolunteers: platformOnly[0],
      participatingNgos: platformOnly[1],
      activeDonors: platformOnly[2],
    },
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
        note: 'Estimates count only deliveries the receiving NGO has confirmed. Quantities entered in meals are converted to kg (and vice versa) with mealsPerKg.',
      },
    },
  };
}

export async function getAdminStats() {
  const [usersByRoleStatus, donationsByStatus, requestsByStatus, activeAssignments, unassigned] = await Promise.all([
    prisma.user.groupBy({ by: ['role', 'accountStatus'], _count: true }),
    prisma.foodDonation.groupBy({ by: ['status'], _count: true }),
    prisma.foodRequest.groupBy({ by: ['status'], _count: true }),
    prisma.volunteerAssignment.count({ where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'PICKED_UP'] } } }),
    prisma.foodRequest.count({ where: { status: 'ACCEPTED' } }),
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
  };
}
