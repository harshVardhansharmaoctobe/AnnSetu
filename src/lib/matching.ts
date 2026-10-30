/**
 * FoodBridge Geographical Matching Engine
 *
 * Calculates a match score (0-100) between a food donation and an NGO
 * using a transparent, deterministic, weighted scoring algorithm.
 *
 * Weights (configurable):
 *   Distance:    40%
 *   Urgency:     30%
 *   Capacity:    20%
 *   Category:    10%
 */

import { calculateDistance } from './utils';

// ─── Configurable weights ───
export const MATCH_WEIGHTS = {
  distance: 0.4,
  urgency: 0.3,
  capacity: 0.2,
  category: 0.1,
};

// Maximum matching distance in km
export const MAX_MATCH_DISTANCE_KM = 25;

// Environmental impact estimates (per kg of food rescued)
export const IMPACT_ESTIMATES = {
  co2PerKg: 2.5,       // kg CO2 saved per kg of food
  waterPerKg: 1000,     // liters of water saved per kg of food
  mealsPerKg: 2.5,      // approximate meals per kg (for KG unit conversions)
};

export interface MatchInput {
  donation: {
    latitude: number;
    longitude: number;
    remainingQuantity: number;
    unit: string;
    foodCategory: string;
    safePickupDeadline: Date | string;
  };
  ngo: {
    latitude: number;
    longitude: number;
    receivingCapacity: number;
    foodPreferences?: string | null;
  };
}

export interface MatchResult {
  distanceKm: number;
  distanceScore: number;
  urgencyScore: number;
  capacityScore: number;
  categoryScore: number;
  totalScore: number;
  explanation: string;
}

export function calculateMatchScore(input: MatchInput): MatchResult {
  const { donation, ngo } = input;

  // ─── Distance Score (40%) ───
  const distanceKm = calculateDistance(
    donation.latitude,
    donation.longitude,
    ngo.latitude,
    ngo.longitude
  );
  // Linear decay: 100 at 0km, 0 at MAX_MATCH_DISTANCE_KM
  const distanceScore = Math.max(0, 100 * (1 - distanceKm / MAX_MATCH_DISTANCE_KM));

  // ─── Urgency Score (30%) ───
  const now = new Date();
  const deadline = new Date(donation.safePickupDeadline);
  const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
  // More urgent (fewer hours) = higher score
  // 0-2h: 100, 2-6h: 80-60, 6-12h: 60-40, 12-24h: 40-20, 24+h: 20-0
  let urgencyScore: number;
  if (hoursRemaining <= 0) {
    urgencyScore = 0; // expired
  } else if (hoursRemaining <= 2) {
    urgencyScore = 100;
  } else if (hoursRemaining <= 6) {
    urgencyScore = 100 - ((hoursRemaining - 2) / 4) * 40;
  } else if (hoursRemaining <= 12) {
    urgencyScore = 60 - ((hoursRemaining - 6) / 6) * 20;
  } else if (hoursRemaining <= 24) {
    urgencyScore = 40 - ((hoursRemaining - 12) / 12) * 20;
  } else {
    urgencyScore = Math.max(0, 20 - ((hoursRemaining - 24) / 24) * 20);
  }

  // ─── Capacity Compatibility Score (20%) ───
  // How well the donation quantity matches NGO capacity
  const ratio = donation.remainingQuantity / ngo.receivingCapacity;
  let capacityScore: number;
  if (ratio <= 1) {
    // Donation fits within capacity: closer to 1 is better
    capacityScore = ratio * 100;
  } else {
    // Donation exceeds capacity: penalty for excess
    capacityScore = Math.max(0, 100 - (ratio - 1) * 50);
  }

  // ─── Category Compatibility Score (10%) ───
  let categoryScore = 50; // default: no preference specified = neutral
  if (ngo.foodPreferences) {
    const preferences = ngo.foodPreferences.split(',').map((p) => p.trim().toUpperCase());
    if (preferences.includes(donation.foodCategory.toUpperCase())) {
      categoryScore = 100;
    } else if (preferences.includes('ALL') || preferences.includes('MIXED')) {
      categoryScore = 80;
    } else {
      categoryScore = 20;
    }
  }

  // ─── Total Weighted Score ───
  const totalScore = Math.round(
    distanceScore * MATCH_WEIGHTS.distance +
    urgencyScore * MATCH_WEIGHTS.urgency +
    capacityScore * MATCH_WEIGHTS.capacity +
    categoryScore * MATCH_WEIGHTS.category
  );

  // ─── Explanation ───
  const explanationParts: string[] = [];
  if (distanceKm <= 3) explanationParts.push('Very close proximity');
  else if (distanceKm <= 10) explanationParts.push('Nearby location');
  else explanationParts.push(`${distanceKm.toFixed(1)}km away`);

  if (hoursRemaining <= 2) explanationParts.push('Urgent pickup needed');
  else if (hoursRemaining <= 6) explanationParts.push('Time-sensitive');

  if (ratio >= 0.5 && ratio <= 1) explanationParts.push('Good capacity fit');
  else if (ratio < 0.5) explanationParts.push('Below capacity');

  if (categoryScore >= 80) explanationParts.push('Category match');

  const explanation = explanationParts.join(' • ');

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    distanceScore: Math.round(distanceScore),
    urgencyScore: Math.round(urgencyScore),
    capacityScore: Math.round(capacityScore),
    categoryScore: Math.round(categoryScore),
    totalScore: Math.min(100, Math.max(0, totalScore)),
    explanation,
  };
}

/**
 * Calculate environmental impact from a completed rescue
 */
export function calculateImpact(quantity: number, unit: string) {
  const weightKg = unit === 'KG' ? quantity : quantity / IMPACT_ESTIMATES.mealsPerKg;
  const meals = unit === 'MEALS' ? quantity : quantity * IMPACT_ESTIMATES.mealsPerKg;

  return {
    mealsRescued: Math.round(meals * 100) / 100,
    weightKg: Math.round(weightKg * 100) / 100,
    co2SavedKg: Math.round(weightKg * IMPACT_ESTIMATES.co2PerKg * 100) / 100,
    waterSavedLiters: Math.round(weightKg * IMPACT_ESTIMATES.waterPerKg * 100) / 100,
  };
}
