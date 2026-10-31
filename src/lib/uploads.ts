import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { badRequest } from '@/lib/api';
import prisma from '@/lib/db';

/**
 * Image uploads (donation photos, pickup/delivery proof).
 *
 * Files are identified by their bytes, never by the client's filename or MIME type, and stored
 * under a server-generated UUID name. Only JPEG/PNG/WebP are accepted; SVG is excluded because it
 * can carry scripts. Storage is behind `UploadStorage`: local disk, or PostgreSQL (see uploadStorage()).
 */

export type ImageExtension = 'jpg' | 'png' | 'webp';

export const CONTENT_TYPES: Record<ImageExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const ALLOWED_CLIENT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_CLIENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const STORED_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function maxUploadBytes() {
  const mb = Number.parseFloat(process.env.MAX_FILE_SIZE_MB ?? '');
  // Vercel functions reject request bodies over 4.5 MB, so the default there is 4 MB.
  const fallback = process.env.VERCEL ? 4 : 5;
  return (Number.isFinite(mb) && mb > 0 ? Math.min(mb, 20) : fallback) * 1024 * 1024;
}

/** Detects the real image type from magic bytes. */
export function detectImageType(bytes: Uint8Array): ImageExtension | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) return 'png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) return 'webp';
  return null;
}

/** Validates an uploaded file and returns its detected type. Throws ApiError(400/413). */
export function validateImage(file: { name: string; type: string; size: number }, bytes: Uint8Array): ImageExtension {
  const max = maxUploadBytes();
  if (file.size === 0 || bytes.length === 0) throw badRequest('The file is empty', 'EMPTY_FILE');
  if (file.size > max || bytes.length > max) {
    throw badRequest(`Images must be ${Math.round(max / 1024 / 1024)} MB or smaller`, 'FILE_TOO_LARGE');
  }
  const ext = path.extname(file.name || '').toLowerCase();
  if (!ALLOWED_CLIENT_EXTENSIONS.has(ext)) {
    throw badRequest('Only .jpg, .png and .webp images are allowed', 'UNSUPPORTED_EXTENSION');
  }
  if (file.type && !ALLOWED_CLIENT_TYPES.has(file.type)) {
    throw badRequest('Only JPEG, PNG and WebP images are allowed', 'UNSUPPORTED_TYPE');
  }
  const detected = detectImageType(bytes);
  if (!detected) throw badRequest('The file is not a valid JPEG, PNG or WebP image', 'INVALID_IMAGE');
  const extFamily = ext === '.jpeg' ? 'jpg' : ext.slice(1);
  if (extFamily !== detected) {
    throw badRequest('The file extension does not match the image content', 'TYPE_MISMATCH');
  }
  return detected;
}

export interface UploadStorage {
  save(name: string, data: Uint8Array): Promise<void>;
  read(name: string): Promise<Buffer | null>;
}

function uploadDir() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
}

export const diskStorage: UploadStorage = {
  async save(name, data) {
    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), data, { flag: 'wx' });
  },
  async read(name) {
    if (!STORED_NAME_PATTERN.test(name)) return null; // blocks traversal ("../") and arbitrary names
    const dir = uploadDir();
    const full = path.join(dir, name);
    if (path.dirname(full) !== dir) return null;
    try {
      return await readFile(full);
    } catch {
      return null;
    }
  },
};

/**
 * Image bytes in PostgreSQL (StoredFile). Used on Vercel, whose filesystem is read-only and temporary,
 * and wherever UPLOAD_STORAGE=database. Images stay behind the signed-in /api/uploads route as before.
 */
export const databaseStorage: UploadStorage = {
  async save(name, data) {
    await prisma.storedFile.create({ data: { fileName: name, data: Buffer.from(data) } });
  },
  async read(name) {
    if (!STORED_NAME_PATTERN.test(name)) return null;
    const row = await prisma.storedFile.findUnique({ where: { fileName: name }, select: { data: true } });
    return row ? Buffer.from(row.data) : null;
  },
};

/** UPLOAD_STORAGE=disk|database; when unset: database on Vercel, disk everywhere else. */
export function uploadStorage(): UploadStorage {
  const mode = process.env.UPLOAD_STORAGE?.trim().toLowerCase() || (process.env.VERCEL ? 'database' : 'disk');
  return mode === 'database' ? databaseStorage : diskStorage;
}

export async function storeImage(file: File, storage: UploadStorage = uploadStorage()) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = validateImage(file, bytes);
  const name = `${randomUUID()}.${ext}`;
  await storage.save(name, bytes);
  return { name, url: `/api/uploads/${name}`, contentType: CONTENT_TYPES[ext], size: bytes.length };
}
