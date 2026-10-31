import prisma from '@/lib/db';
import { requireUser } from '@/lib/api-auth';
import { notFound, route } from '@/lib/api';
import { CONTENT_TYPES, STORED_NAME_PATTERN, uploadStorage, type ImageExtension } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

// GET /api/uploads/:name – signed-in users only; names are unguessable UUIDs.
export const GET = route<{ name: string }>('uploads:get', async (_request, { name }) => {
  const auth = await requireUser({ statuses: ['APPROVED', 'PENDING', 'REJECTED'] });
  if (auth.error) return auth.error;
  if (!STORED_NAME_PATTERN.test(name)) throw notFound('File not found');
  // Only files registered through the upload API are served.
  const meta = await prisma.upload.findUnique({ where: { fileName: name }, select: { id: true } });
  if (!meta) throw notFound('File not found');

  const data = await uploadStorage().read(name);
  if (!data) throw notFound('File not found');
  const ext = name.split('.').pop() as ImageExtension;

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': CONTENT_TYPES[ext],
      'Content-Length': String(data.length),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'none'; sandbox",
    },
  });
});
