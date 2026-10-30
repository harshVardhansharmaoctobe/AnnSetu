import { z } from 'zod';

// ─── Auth Schemas ───
// Emails are trimmed and lower-cased so "A@x.com" and "a@x.com" are the same account.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Public registration can never create ADMIN accounts; admins are provisioned directly in the database.
export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
  phone: z.string().optional(),
  role: z.enum(['DONOR', 'NGO', 'VOLUNTEER']),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// ─── Donor Profile Schema ───
export const donorProfileSchema = z.object({
  organisationName: z.string().min(2, 'Organisation name is required'),
  organisationType: z.string().min(1, 'Organisation type is required'),
  address: z.string().min(5, 'Address is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().optional(),
});

// ─── NGO Profile Schema ───
export const ngoProfileSchema = z.object({
  organisationName: z.string().min(2, 'Organisation name is required'),
  address: z.string().min(5, 'Address is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().optional(),
  receivingCapacity: z.number().int().min(1, 'Capacity must be at least 1'),
  foodPreferences: z.string().optional(),
});

// ─── Volunteer Profile Schema ───
export const volunteerProfileSchema = z.object({
  address: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  vehicleType: z.string().optional(),
  maxDistance: z.number().min(1).max(100).optional(),
});

// ─── Profile Update Schema ───
// .strict() rejects protected fields (id, userId, role, accountStatus, ...) with a 400
// instead of silently dropping them.
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  phone: z.string().trim().max(20, 'Phone number is too long').optional(),
  donorProfile: donorProfileSchema.strict().optional(),
  ngoProfile: ngoProfileSchema.strict().optional(),
  volunteerProfile: volunteerProfileSchema.strict().optional(),
}).strict();

// ─── Food Donation Schema ───
export const foodDonationSchema = z.object({
  foodName: z.string().min(2, 'Food name is required'),
  description: z.string().optional(),
  foodCategory: z.enum([
    'COOKED_MEALS', 'RAW_VEGETABLES', 'RAW_FRUITS', 'BAKERY',
    'DAIRY', 'BEVERAGES', 'PACKAGED', 'MIXED', 'OTHER',
  ]),
  foodType: z.enum(['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN']),
  quantity: z.number().min(0.1, 'Quantity must be greater than zero'),
  unit: z.enum(['MEALS', 'KG']),
  preparationTime: z.string().refine((val) => {
    const date = new Date(val);
    return date <= new Date();
  }, 'Preparation time cannot be in the future'),
  storageConditions: z.string().min(1, 'Storage conditions are required'),
  safePickupDeadline: z.string().refine((val) => {
    const date = new Date(val);
    return date > new Date();
  }, 'Pickup deadline must be in the future'),
  foodSafetyDeclared: z.literal(true, {
    errorMap: () => ({ message: 'You must declare food safety' }),
  }),
  pickupAddress: z.string().min(5, 'Pickup address is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// ─── Food Request Schema ───
export const foodRequestSchema = z.object({
  donationId: z.string().min(1),
  requestedQuantity: z.number().min(0.1, 'Quantity must be greater than zero'),
  notes: z.string().optional(),
});

// ─── Delivery Confirmation Schema ───
export const deliveryConfirmSchema = z.object({
  deliveredQuantity: z.number().min(0),
  notes: z.string().optional(),
  disputeReason: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type DonorProfileInput = z.infer<typeof donorProfileSchema>;
export type NGOProfileInput = z.infer<typeof ngoProfileSchema>;
export type VolunteerProfileInput = z.infer<typeof volunteerProfileSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type FoodDonationInput = z.infer<typeof foodDonationSchema>;
export type FoodRequestInput = z.infer<typeof foodRequestSchema>;
export type DeliveryConfirmInput = z.infer<typeof deliveryConfirmSchema>;
