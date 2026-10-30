import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { profileUpdateSchema } from '@/lib/validations';
import { assertOwnUpload } from '@/lib/workflow';
import { toErrorResponse } from '@/lib/api';

export const dynamic = 'force-dynamic';

const PROFILE_KEYS = ['donorProfile', 'ngoProfile', 'volunteerProfile'] as const;
const PROFILE_KEY_BY_ROLE = {
  DONOR: 'donorProfile',
  NGO: 'ngoProfile',
  VOLUNTEER: 'volunteerProfile',
  ADMIN: undefined,
} as const;

// GET /api/profile - Get current user's profile
// PENDING and REJECTED users may read their own profile so the UI can show their status.
export async function GET() {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  if (auth.error) return auth.error;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      include: {
        donorProfile: true,
        ngoProfile: true,
        volunteerProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { password, ...safeUser } = user;
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PUT /api/profile - Update the current user's own profile
// PENDING users may edit so admins can review a completed profile before approving.
export async function PUT(request: NextRequest) {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING'] });
  if (auth.error) return auth.error;
  const { id: userId, role } = auth.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, phone, avatarUrl, donorProfile, ngoProfile, volunteerProfile } = parsed.data;
  // Only an image this user uploaded as a profile photo may be used.
  try {
    await assertOwnUpload(prisma, avatarUrl, userId, 'AVATAR');
  } catch (error) {
    return toErrorResponse(error, 'profile:avatar');
  }

  // Users may only write the profile type that matches their own role.
  const allowedKey = PROFILE_KEY_BY_ROLE[role];
  const disallowed = PROFILE_KEYS.filter((key) => parsed.data[key] && key !== allowedKey);
  if (disallowed.length > 0) {
    return NextResponse.json(
      { error: `${disallowed.join(', ')} cannot be set for a ${role} account` },
      { status: 400 }
    );
  }

  try {
    // userId always comes from the session, never from the request body.
    await prisma.$transaction(async (tx) => {
      if (name !== undefined || phone !== undefined || avatarUrl !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { name, phone, avatarUrl } });
      }
      if (donorProfile) {
        await tx.donorProfile.upsert({
          where: { userId },
          create: { ...donorProfile, userId },
          update: donorProfile,
        });
      }
      if (ngoProfile) {
        await tx.nGOProfile.upsert({
          where: { userId },
          create: { ...ngoProfile, userId },
          update: ngoProfile,
        });
      }
      if (volunteerProfile) {
        await tx.volunteerProfile.upsert({
          where: { userId },
          create: { ...volunteerProfile, userId },
          update: volunteerProfile,
        });
      }
    });

    return NextResponse.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
