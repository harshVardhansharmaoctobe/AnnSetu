import { describe, expect, it } from 'vitest';
import { Client, JPEG_HEADER, PNG_BYTES } from '../support/http';
import { signedIn } from '../support/factories';
import { existsSync } from 'fs';
import path from 'path';
import { TEST_UPLOAD_DIR } from '../support/server';
import { testPrisma } from '../support/test-db';

describe('image uploads', () => {
  it('stores a valid image under a random name and serves it safely', async () => {
    const { client } = await signedIn('DONOR');
    const res = await client.upload('my food.png', PNG_BYTES, 'image/png');
    expect(res.status).toBe(201);
    expect(res.data.url).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.png$/);

    const file = await client.get(res.data.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
    expect(file.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('database storage (the Vercel mode): bytes live in PostgreSQL, not on the server disk', async () => {
    const { client } = await signedIn('VOLUNTEER');
    const res = await client.upload('proof.png', PNG_BYTES, 'image/png', 'DELIVERY_PROOF');
    expect(res.status).toBe(201);
    const fileName = res.data.url.split('/').pop();
    const row = await testPrisma().storedFile.findUniqueOrThrow({ where: { fileName } });
    expect(Buffer.from(row.data).equals(Buffer.from(PNG_BYTES))).toBe(true);
    expect(existsSync(path.join(process.cwd(), TEST_UPLOAD_DIR, fileName))).toBe(false);
    const served = await client.get(res.data.url);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-length')).toBe(String(PNG_BYTES.length));
  });

  it('ignores a malicious client filename', async () => {
    const { client } = await signedIn('VOLUNTEER');
    const res = await client.upload('../../../etc/passwd.png', PNG_BYTES, 'image/png');
    expect(res.status).toBe(201);
    expect(res.data.url).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.png$/);
  });

  it.each([
    ['text content renamed to .png', 'notes.png', new TextEncoder().encode('just some text, not an image'), 'image/png', 'INVALID_IMAGE'],
    ['an SVG (script-capable)', 'evil.svg', new TextEncoder().encode('<svg><script>alert(1)</script></svg>'), 'image/svg+xml', 'UNSUPPORTED_EXTENSION'],
    ['an executable', 'setup.exe', Uint8Array.from([0x4d, 0x5a, 0x90, 0]), 'application/octet-stream', 'UNSUPPORTED_EXTENSION'],
    ['a disallowed MIME type', 'page.png', PNG_BYTES, 'text/html', 'UNSUPPORTED_TYPE'],
    ['JPEG bytes named .png', 'photo.png', JPEG_HEADER, 'image/png', 'TYPE_MISMATCH'],
  ])('rejects %s', async (_label, name, bytes, type, code) => {
    const { client } = await signedIn('DONOR');
    const res = await client.upload(name, bytes, type);
    expect(res.status).toBe(400);
    expect(res.data.code).toBe(code);
  });

  it('rejects oversized files before storing them', async () => {
    const { client } = await signedIn('DONOR');
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(PNG_BYTES);
    const res = await client.upload('big.png', big, 'image/png');
    expect([400, 413]).toContain(res.status);
    expect(res.data.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects requests without a file', async () => {
    const { client } = await signedIn('DONOR');
    const res = await client.req('POST', '/api/uploads', { body: new FormData() });
    expect(res.status).toBe(400);
  });

  it('requires an approved donor or volunteer', async () => {
    expect((await new Client().upload('a.png', PNG_BYTES, 'image/png')).status).toBe(401);
    expect((await (await signedIn('NGO')).client.upload('a.png', PNG_BYTES, 'image/png')).status).toBe(403);
    expect((await (await signedIn('DONOR', 'PENDING')).client.upload('a.png', PNG_BYTES, 'image/png')).status).toBe(403);
  });

  it('blocks path traversal and anonymous access when reading files', async () => {
    const { client } = await signedIn('DONOR');
    for (const url of ['/api/uploads/..%2F..%2F.env', '/api/uploads/..%5C..%5Cpackage.json', '/api/uploads/package.json']) {
      const res = await client.get(url);
      expect(res.status, url).toBe(404);
      expect(String(res.data)).not.toContain('DATABASE_URL');
    }
    const stored = (await client.upload('a.png', PNG_BYTES, 'image/png')).data.url;
    expect((await new Client().get(stored)).status).toBe(401);
  });
});
