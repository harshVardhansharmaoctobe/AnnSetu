import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import { registerSchema } from '@/lib/validations';
import { clientIp, errorResponse, parseBody, route } from '@/lib/api';
import { limiters } from '@/lib/rate-limit';
import { audit, notify, notifyAdmins } from '@/lib/events';

export const POST = route('register', async (request: NextRequest) => {
  const ip = clientIp(request);
  const limit = limiters.registration.hit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many registrations from this network. Please try again later.', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let data;
  try {
    data = await parseBody(request, registerSchema);
  } catch (error) {
    // Keep the field-level shape the registration form expects.
    const details = (error as { details?: { fieldErrors?: unknown } }).details;
    return errorResponse(400, (error as Error).message, 'VALIDATION_FAILED', details?.fieldErrors ?? details);
  }
  const { name, email, password, phone, role, donorProfile, ngoProfile, volunteerProfile } = data;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return errorResponse(409, 'Email already registered', 'EMAIL_TAKEN');

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Public registration cannot create ADMIN accounts; all new accounts start as PENDING.
      const created = await tx.user.create({
        data: { name, email, password: hashedPassword, phone, role, accountStatus: 'PENDING' },
        select: { id: true, email: true, name: true, role: true, accountStatus: true },
      });
      // The role's own profile (validated by registerSchema to match the role) is created with the account.
      if (role === 'DONOR' && donorProfile) await tx.donorProfile.create({ data: { ...donorProfile, userId: created.id } });
      if (role === 'NGO' && ngoProfile) await tx.nGOProfile.create({ data: { ...ngoProfile, userId: created.id } });
      if (role === 'VOLUNTEER') await tx.volunteerProfile.create({ data: { ...volunteerProfile, userId: created.id } });

      await audit(tx, {
        userId: created.id,
        action: 'USER_REGISTERED',
        entity: 'User',
        entityId: created.id,
        details: `New ${role} account registered`,
        ipAddress: ip,
      });
      await notify(tx, {
        userId: created.id,
        type: 'REGISTRATION_SUBMITTED',
        title: 'Registration received',
        message: 'Thanks for joining FoodBridge! Complete your profile while an admin reviews your account.',
        link: '/dashboard/profile',
      });
      await notifyAdmins(tx, {
        type: 'GENERAL',
        title: 'New account awaiting approval',
        message: `${name} registered as ${role.toLowerCase()}.`,
        link: '/dashboard/admin/users?status=PENDING',
      });
      return created;
    });

    return NextResponse.json({ message: 'Registration successful', user }, { status: 201 });
  } catch (error) {
    // Two concurrent sign-ups with the same email: the unique constraint catches the loser.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return errorResponse(409, 'Email already registered', 'EMAIL_TAKEN');
    }
    throw error;
  }
});
