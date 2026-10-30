import { describe, expect, it } from 'vitest';
import {
  confirmReceiptSchema, deliverySchema, donationCreateSchema, donationUpdateSchema, foodRequestSchema,
  loginSchema, markReadSchema, profileUpdateSchema, registerSchema,
} from './validations';

const HOUR = 3_600_000;
const donation = (overrides: Record<string, unknown> = {}) => ({
  foodName: 'Dal rice', foodCategory: 'COOKED_MEALS', foodType: 'VEGETARIAN', quantity: 20, unit: 'MEALS',
  preparationTime: new Date(Date.now() - HOUR).toISOString(),
  safePickupDeadline: new Date(Date.now() + 4 * HOUR).toISOString(),
  storageConditions: 'Hot-held', pickupAddress: '1 Test Road', latitude: 26.9, longitude: 75.8, foodSafetyDeclared: true,
  ...overrides,
});
const issuesFor = (result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  result.success ? [] : result.error!.issues.map((i) => i.path.join('.'));

describe('auth schemas', () => {
  it('normalises email case and whitespace', () => {
    expect(loginSchema.parse({ email: '  A@Example.COM ', password: 'secret12' }).email).toBe('a@example.com');
  });
  it('never allows public ADMIN registration', () => {
    const r = registerSchema.safeParse({ name: 'X Y', email: 'a@b.co', password: 'longenough', confirmPassword: 'longenough', role: 'ADMIN' });
    expect(issuesFor(r)).toContain('role');
  });
  it('requires matching passwords of at least 8 characters', () => {
    expect(issuesFor(registerSchema.safeParse({ name: 'X Y', email: 'a@b.co', password: 'short', confirmPassword: 'short', role: 'DONOR' }))).toContain('password');
    expect(issuesFor(registerSchema.safeParse({ name: 'X Y', email: 'a@b.co', password: 'longenough', confirmPassword: 'different1', role: 'DONOR' }))).toContain('confirmPassword');
  });
});

describe('profile update schema', () => {
  it('rejects protected fields at every level', () => {
    for (const body of [{ role: 'ADMIN' }, { accountStatus: 'APPROVED' }, { id: 'x' }, { userId: 'x' }]) {
      expect(profileUpdateSchema.safeParse(body).success).toBe(false);
    }
    const nested = { donorProfile: { organisationName: 'Org', organisationType: 'hotel', address: '12345 Road', latitude: 1, longitude: 1, userId: 'other' } };
    expect(profileUpdateSchema.safeParse(nested).success).toBe(false);
  });
});

describe('donation schemas', () => {
  it('accepts a valid donation', () => {
    expect(donationCreateSchema.safeParse(donation()).success).toBe(true);
  });
  it('rejects zero, negative and missing quantities', () => {
    expect(issuesFor(donationCreateSchema.safeParse(donation({ quantity: 0 })))).toContain('quantity');
    expect(issuesFor(donationCreateSchema.safeParse(donation({ quantity: -5 })))).toContain('quantity');
    expect(issuesFor(donationCreateSchema.safeParse(donation({ quantity: undefined })))).toContain('quantity');
  });
  it('validates preparation and pickup times', () => {
    expect(issuesFor(donationCreateSchema.safeParse(donation({ safePickupDeadline: new Date(Date.now() - HOUR).toISOString() })))).toContain('safePickupDeadline');
    expect(issuesFor(donationCreateSchema.safeParse(donation({ safePickupDeadline: new Date(Date.now() + 8 * 24 * HOUR).toISOString() })))).toContain('safePickupDeadline');
    expect(issuesFor(donationCreateSchema.safeParse(donation({ preparationTime: new Date(Date.now() + 2 * HOUR).toISOString() })))).toContain('preparationTime');
    expect(issuesFor(donationCreateSchema.safeParse(donation({ safePickupDeadline: 'not a date' })))).toContain('safePickupDeadline');
  });
  it('requires the food safety declaration and only internal photo URLs', () => {
    expect(issuesFor(donationCreateSchema.safeParse(donation({ foodSafetyDeclared: false })))).toContain('foodSafetyDeclared');
    expect(issuesFor(donationCreateSchema.safeParse(donation({ photoUrl: 'https://evil.example/x.png' })))).toContain('photoUrl');
    expect(donationCreateSchema.safeParse(donation({ photoUrl: '/api/uploads/0b9f6a2e-4c1d-4e8f-9a7b-1c2d3e4f5a6b.png' })).success).toBe(true);
  });
  it('rejects server-controlled fields on create and update', () => {
    for (const field of ['status', 'remainingQuantity', 'donorProfileId', 'id']) {
      expect(donationCreateSchema.safeParse(donation({ [field]: 'x' })).success).toBe(false);
      expect(donationUpdateSchema.safeParse({ [field]: 'x' }).success).toBe(false);
    }
  });
});

describe('workflow schemas', () => {
  it('validates request quantities', () => {
    expect(foodRequestSchema.safeParse({ donationId: 'd', requestedQuantity: 0 }).success).toBe(false);
    expect(foodRequestSchema.safeParse({ donationId: 'd', requestedQuantity: -1 }).success).toBe(false);
    expect(foodRequestSchema.safeParse({ donationId: 'd', requestedQuantity: 2, beneficiaryCount: 40 }).success).toBe(true);
  });
  it('requires proof and a positive quantity for delivery', () => {
    expect(deliverySchema.safeParse({ deliveredQuantity: 5 }).success).toBe(false);
    expect(deliverySchema.safeParse({ photoUrl: '/api/uploads/0b9f6a2e-4c1d-4e8f-9a7b-1c2d3e4f5a6b.jpg', deliveredQuantity: 0 }).success).toBe(false);
  });
  it('requires a reason for disputes', () => {
    expect(confirmReceiptSchema.safeParse({ outcome: 'CONFIRMED' }).success).toBe(true);
    expect(confirmReceiptSchema.safeParse({ outcome: 'DISPUTED' }).success).toBe(false);
    expect(confirmReceiptSchema.safeParse({ outcome: 'DISPUTED', disputeReason: 'Food arrived spoiled' }).success).toBe(true);
  });
  it('mark-read accepts one id or all, nothing else', () => {
    expect(markReadSchema.safeParse({ id: 'n1' }).success).toBe(true);
    expect(markReadSchema.safeParse({ all: true }).success).toBe(true);
    expect(markReadSchema.safeParse({ ids: ['a', 'b'] }).success).toBe(false);
    expect(markReadSchema.safeParse({ all: false }).success).toBe(false);
  });
});
