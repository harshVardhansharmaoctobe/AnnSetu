import type { Prisma } from '@prisma/client';

/** Public-safe user fields; never includes the password hash. */
export const publicUserSelect = {
  id: true,
  name: true,
  role: true,
} satisfies Prisma.UserSelect;

/** Contact details, shared only between the parties of the same delivery. */
export const contactSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
} satisfies Prisma.UserSelect;

/** Admin view of an account. */
export const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  accountStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
