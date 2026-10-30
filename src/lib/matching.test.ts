import { describe, expect, it } from 'vitest';
import { calculateImpact, calculateMatchScore, IMPACT_ESTIMATES } from './matching';
import { calculateDistance } from './utils';

describe('calculateDistance', () => {
  it('is zero for the same point and symmetric', () => {
    expect(calculateDistance(26.9, 75.8, 26.9, 75.8)).toBe(0);
    expect(calculateDistance(26.85, 75.76, 26.91, 75.73)).toBe(calculateDistance(26.91, 75.73, 26.85, 75.76));
  });
  it('matches a known distance (Jaipur Mansarovar → C-Scheme ≈ 6.6 km)', () => {
    const d = calculateDistance(26.8505, 75.7646, 26.9012, 75.7985);
    expect(d).toBeGreaterThan(6);
    expect(d).toBeLessThan(7.2);
  });
});

describe('calculateImpact', () => {
  it('converts meals to kg and applies the documented factors', () => {
    const r = calculateImpact(25, 'MEALS');
    expect(r.mealsRescued).toBe(25);
    expect(r.weightKg).toBe(25 / IMPACT_ESTIMATES.mealsPerKg);
    expect(r.co2SavedKg).toBe(r.weightKg * IMPACT_ESTIMATES.co2PerKg);
    expect(r.waterSavedLiters).toBe(r.weightKg * IMPACT_ESTIMATES.waterPerKg);
  });
  it('converts kg to meals', () => {
    const r = calculateImpact(4, 'KG');
    expect(r.weightKg).toBe(4);
    expect(r.mealsRescued).toBe(4 * IMPACT_ESTIMATES.mealsPerKg);
  });
});

describe('calculateMatchScore', () => {
  const base = {
    donation: { latitude: 26.9, longitude: 75.8, remainingQuantity: 50, unit: 'MEALS', foodCategory: 'BAKERY', safePickupDeadline: new Date(Date.now() + 3_600_000) },
    ngo: { latitude: 26.9, longitude: 75.8, receivingCapacity: 50, foodPreferences: 'BAKERY' },
  };
  it('scores a nearby, urgent, well-fitting match highly and stays within 0–100', () => {
    const r = calculateMatchScore(base);
    expect(r.totalScore).toBeGreaterThanOrEqual(90);
    expect(r.totalScore).toBeLessThanOrEqual(100);
  });
  it('scores a distant donation lower', () => {
    const far = calculateMatchScore({ ...base, ngo: { ...base.ngo, latitude: 27.3 } });
    expect(far.totalScore).toBeLessThan(calculateMatchScore(base).totalScore);
    expect(far.distanceScore).toBe(0);
  });
});
