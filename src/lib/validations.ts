import { z } from 'zod';

const FOOD_CATEGORY_VALUES = [
  'COOKED_MEALS', 'RAW_VEGETABLES', 'RAW_FRUITS', 'BAKERY',
  'DAIRY', 'BEVERAGES', 'PACKAGED', 'MIXED', 'OTHER',
] as const;
const FOOD_TYPE_VALUES = ['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN'] as const;

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/** Only images stored by our own upload endpoint may be referenced (no arbitrary external URLs). */
export const UPLOAD_URL_PATTERN = /^\/api\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const uploadUrl = z.string().regex(UPLOAD_URL_PATTERN, 'Upload the image through FoodBridge first');

const optionalText = (max: number) => z.string().trim().max(max).optional();

// ─── Auth Schemas ───
// Emails are trimmed and lower-cased so "A@x.com" and "a@x.com" are the same account.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Public registration can never create ADMIN accounts; admins are provisioned directly in the database.
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  confirmPassword: z.string(),
  phone: optionalText(20),
  role: z.enum(['DONOR', 'NGO', 'VOLUNTEER']),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ─── Profile Schemas ───
export const donorProfileSchema = z.object({
  organisationName: z.string().trim().min(2, 'Organisation name is required').max(120),
  organisationType: z.string().trim().min(1, 'Organisation type is required').max(40),
  address: z.string().trim().min(5, 'Address is required').max(300),
  latitude,
  longitude,
  description: optionalText(1000),
});

export const ngoProfileSchema = z.object({
  organisationName: z.string().trim().min(2, 'Organisation name is required').max(120),
  registrationNumber: optionalText(60),
  address: z.string().trim().min(5, 'Address is required').max(300),
  latitude,
  longitude,
  description: optionalText(1000),
  receivingCapacity: z.number().int().min(1, 'Capacity must be at least 1').max(100_000),
  foodPreferences: optionalText(300),
});

export const volunteerProfileSchema = z.object({
  address: optionalText(300),
  latitude: latitude.optional(),
  longitude: longitude.optional(),
  vehicleType: optionalText(40),
  availability: optionalText(200),
  isAvailable: z.boolean().optional(),
  maxDistance: z.number().min(1).max(100).optional(),
});

// .strict() rejects protected fields (id, userId, role, accountStatus, ...) with a 400
// instead of silently dropping them.
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  phone: z.string().trim().max(20, 'Phone number is too long').optional(),
  donorProfile: donorProfileSchema.strict().optional(),
  ngoProfile: ngoProfileSchema.strict().optional(),
  volunteerProfile: volunteerProfileSchema.strict().optional(),
}).strict();

// ─── Food Donation Schemas ───
const MAX_PICKUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const donationFields = z.object({
  foodName: z.string().trim().min(2, 'Food name is required').max(120),
  description: optionalText(1000),
  foodCategory: z.enum(FOOD_CATEGORY_VALUES),
  foodType: z.enum(FOOD_TYPE_VALUES),
  quantity: z.number().positive('Quantity must be greater than zero').max(100_000, 'Quantity is too large'),
  unit: z.enum(['MEALS', 'KG']),
  preparationTime: z.coerce.date({ invalid_type_error: 'Invalid preparation time' }),
  storageConditions: z.string().trim().min(1, 'Storage conditions are required').max(300),
  handlingInstructions: optionalText(500),
  contactPhone: optionalText(20),
  safePickupDeadline: z.coerce.date({ invalid_type_error: 'Invalid pickup deadline' }),
  foodSafetyDeclared: z.literal(true, { errorMap: () => ({ message: 'You must declare food safety' }) }),
  photoUrl: uploadUrl.optional(),
  pickupAddress: z.string().trim().min(5, 'Pickup address is required').max(300),
  latitude,
  longitude,
});

function checkDonationDates(
  data: { preparationTime?: Date; safePickupDeadline?: Date },
  ctx: z.RefinementCtx
) {
  const now = Date.now();
  if (data.preparationTime && data.preparationTime.getTime() > now + CLOCK_SKEW_MS) {
    ctx.addIssue({ code: 'custom', path: ['preparationTime'], message: 'Preparation time cannot be in the future' });
  }
  if (data.safePickupDeadline) {
    const deadline = data.safePickupDeadline.getTime();
    if (deadline <= now) {
      ctx.addIssue({ code: 'custom', path: ['safePickupDeadline'], message: 'Pickup deadline must be in the future' });
    } else if (deadline > now + MAX_PICKUP_WINDOW_MS) {
      ctx.addIssue({ code: 'custom', path: ['safePickupDeadline'], message: 'Pickup deadline must be within 7 days' });
    }
    if (data.preparationTime && deadline <= data.preparationTime.getTime()) {
      ctx.addIssue({ code: 'custom', path: ['safePickupDeadline'], message: 'Pickup deadline must be after preparation time' });
    }
  }
}

export const donationCreateSchema = donationFields.strict().superRefine(checkDonationDates);
// Editable fields only; status, quantities reserved and ownership can never be set by the client.
export const donationUpdateSchema = donationFields
  .omit({ foodSafetyDeclared: true })
  .partial()
  .strict()
  .superRefine(checkDonationDates);

/** @deprecated kept for existing imports; use donationCreateSchema. */
export const foodDonationSchema = donationCreateSchema;

// ─── Request Schemas ───
export const foodRequestSchema = z.object({
  donationId: z.string().min(1).max(40),
  requestedQuantity: z.number().positive('Quantity must be greater than zero').max(100_000),
  beneficiaryCount: z.number().int().min(1).max(100_000).optional(),
  notes: optionalText(500),
}).strict();

export const reasonSchema = z.object({ reason: optionalText(300) }).strict();

export const confirmReceiptSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('CONFIRMED'), notes: optionalText(500) }).strict(),
  z.object({
    outcome: z.literal('DISPUTED'),
    disputeReason: z.string().trim().min(5, 'Describe the problem').max(500),
  }).strict(),
]);

// ─── Assignment Schemas ───
export const assignmentCreateSchema = z.object({
  requestId: z.string().min(1).max(40),
  // Admin assignments name the volunteer; volunteers self-claim by omitting it.
  volunteerProfileId: z.string().min(1).max(40).optional(),
}).strict();

export const pickupSchema = z.object({
  photoUrl: uploadUrl.optional(),
  notes: optionalText(500),
}).strict();

export const deliverySchema = z.object({
  photoUrl: uploadUrl, // proof is mandatory for completion
  deliveredQuantity: z.number().positive('Delivered quantity must be greater than zero').max(100_000),
  notes: optionalText(500),
}).strict();

// ─── Admin Schemas ───
export const accountActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'suspend', 'reinstate']),
  reason: optionalText(300),
}).strict();

// ─── Notification Schemas ───
// Single id or all – deliberately no arrays, so request size stays trivially bounded.
export const markReadSchema = z.union([
  z.object({ id: z.string().min(1).max(40) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

// ─── Query Schemas ───
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(50).default(20);

export const donationQuerySchema = z.object({
  scope: z.enum(['available', 'mine', 'all']).default('available'),
  q: z.string().trim().max(100).optional(),
  category: z.enum(FOOD_CATEGORY_VALUES).optional(),
  foodType: z.enum(FOOD_TYPE_VALUES).optional(),
  status: z.enum(['AVAILABLE', 'PARTIALLY_RESERVED', 'FULLY_RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED']).optional(),
  expiresWithinHours: z.coerce.number().positive().max(168).optional(),
  sort: z.enum(['newest', 'nearest', 'expiry']).default('newest'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(200).optional(),
  page,
  pageSize,
});

const REQUEST_STATUSES = [
  'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'VOLUNTEER_ASSIGNED',
  'PICKED_UP', 'DELIVERED', 'COMPLETED', 'DISPUTED',
] as const;

export const requestQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  donationId: z.string().max(40).optional(),
  page,
  pageSize,
});

export const assignmentQuerySchema = z.object({
  scope: z.enum(['mine', 'open', 'all']).default('mine'),
  status: z.enum(['ASSIGNED', 'ACCEPTED', 'DECLINED', 'PICKED_UP', 'DELIVERED', 'CANCELLED']).optional(),
  page,
  pageSize,
});

export const userQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['DONOR', 'NGO', 'VOLUNTEER', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED']).optional(),
  page,
  pageSize,
});

export const paginationQuerySchema = z.object({ page, pageSize, unreadOnly: z.enum(['true', 'false']).optional() });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type DonorProfileInput = z.infer<typeof donorProfileSchema>;
export type NGOProfileInput = z.infer<typeof ngoProfileSchema>;
export type VolunteerProfileInput = z.infer<typeof volunteerProfileSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type DonationCreateInput = z.infer<typeof donationCreateSchema>;
export type DonationUpdateInput = z.infer<typeof donationUpdateSchema>;
export type FoodRequestInput = z.infer<typeof foodRequestSchema>;
