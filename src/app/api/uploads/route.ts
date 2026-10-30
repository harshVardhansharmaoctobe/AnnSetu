import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { badRequest, errorResponse, route } from '@/lib/api';
import { limiters } from '@/lib/rate-limit';
import { maxUploadBytes, storeImage } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

// POST /api/uploads  (multipart/form-data, field "file") → { url }
// Donors upload food photos; volunteers upload pickup/delivery proof.
export const POST = route('uploads:create', async (request) => {
  const auth = await requireUser({ roles: ['DONOR', 'VOLUNTEER'] });
  if (auth.error) return auth.error;

  // Reject oversized bodies before reading them into memory (multipart adds a little overhead).
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxUploadBytes() + 64 * 1024) {
    return errorResponse(413, `Images must be ${Math.round(maxUploadBytes() / 1024 / 1024)} MB or smaller`, 'FILE_TOO_LARGE');
  }
  const limit = limiters.uploads.hit(auth.user.id);
  if (!limit.allowed) return errorResponse(429, 'Too many uploads. Please try again later.', 'RATE_LIMITED');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest('Send the image as multipart/form-data in a "file" field', 'INVALID_FORM');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw badRequest('Attach an image in the "file" field', 'NO_FILE');

  const stored = await storeImage(file);
  return NextResponse.json({ url: stored.url, size: stored.size, contentType: stored.contentType }, { status: 201 });
});
