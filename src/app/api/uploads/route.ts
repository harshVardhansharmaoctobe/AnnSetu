import { NextResponse } from 'next/server';
import type { UploadPurpose } from '@prisma/client';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { badRequest, errorResponse, forbidden, route } from '@/lib/api';
import { limiters } from '@/lib/rate-limit';
import { maxUploadBytes, storeImage } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

/** Which roles may upload for which purpose (profile photos are allowed while an account is pending). */
const PURPOSES_BY_ROLE: Record<string, UploadPurpose[]> = {
  DONOR: ['DONATION_PHOTO', 'AVATAR'],
  VOLUNTEER: ['PICKUP_PROOF', 'DELIVERY_PROOF', 'AVATAR'],
  NGO: ['AVATAR'],
  ADMIN: ['AVATAR'],
};
const ALL_PURPOSES: UploadPurpose[] = ['DONATION_PHOTO', 'PICKUP_PROOF', 'DELIVERY_PROOF', 'AVATAR'];

// POST /api/uploads  (multipart/form-data: "file", "purpose") → { url }
export const POST = route('uploads:create', async (request) => {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING'] });
  if (auth.error) return auth.error;
  const user = auth.user;

  // Reject oversized bodies before reading them into memory (multipart adds a little overhead).
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxUploadBytes() + 64 * 1024) {
    return errorResponse(413, `Images must be ${Math.round(maxUploadBytes() / 1024 / 1024)} MB or smaller`, 'FILE_TOO_LARGE');
  }
  const limit = limiters.uploads.hit(user.id);
  if (!limit.allowed) return errorResponse(429, 'Too many uploads. Please try again later.', 'RATE_LIMITED');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest('Send the image as multipart/form-data in a "file" field', 'INVALID_FORM');
  }

  const rawPurpose = form.get('purpose');
  let purpose: UploadPurpose;

  if (rawPurpose !== null && rawPurpose !== undefined && rawPurpose !== '') {
    if (typeof rawPurpose !== 'string' || !ALL_PURPOSES.includes(rawPurpose as UploadPurpose)) {
      throw badRequest('Say what the image is for (purpose)', 'INVALID_PURPOSE');
    }
    if (!PURPOSES_BY_ROLE[user.role]?.includes(rawPurpose as UploadPurpose)) {
      throw forbidden('Your role cannot upload this kind of image');
    }
    if (rawPurpose !== 'AVATAR' && user.accountStatus !== 'APPROVED') {
      throw forbidden('Your account must be approved before uploading', 'ACCOUNT_PENDING');
    }
    purpose = rawPurpose as UploadPurpose;
  } else {
    // When purpose is omitted, default based on role, or require approval
    if (user.accountStatus !== 'APPROVED') {
      throw forbidden('Your account must be approved before uploading', 'ACCOUNT_PENDING');
    }
    if (user.role === 'DONOR') {
      purpose = 'DONATION_PHOTO';
    } else if (user.role === 'VOLUNTEER') {
      purpose = 'DELIVERY_PROOF';
    } else {
      throw forbidden('Your role cannot upload this kind of image');
    }
  }

  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Attach an image in the "file" field', 'NO_FILE');

  const stored = await storeImage(file);
  await prisma.upload.create({
    data: {
      fileName: stored.name, url: stored.url, contentType: stored.contentType, size: stored.size,
      purpose, uploadedById: user.id,
    },
  });
  return NextResponse.json({ url: stored.url, size: stored.size, contentType: stored.contentType, purpose }, { status: 201 });
});
