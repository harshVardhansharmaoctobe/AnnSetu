import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { databaseStorage, detectImageType, diskStorage, maxUploadBytes, STORED_NAME_PATTERN, uploadStorage, validateImage } from './uploads';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
const SVG = Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]);

const file = (name: string, type: string, size: number) => ({ name, type, size });
const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as ApiError).code;
  }
};

describe('detectImageType', () => {
  it('recognises PNG, JPEG and WebP by magic bytes', () => {
    expect(detectImageType(PNG)).toBe('png');
    expect(detectImageType(JPEG)).toBe('jpg');
    expect(detectImageType(WEBP)).toBe('webp');
  });
  it('rejects SVG, executables and empty input', () => {
    expect(detectImageType(SVG)).toBeNull();
    expect(detectImageType(EXE)).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe('validateImage', () => {
  it('accepts a valid image and returns its real type', () => {
    expect(validateImage(file('photo.PNG', 'image/png', PNG.length), PNG)).toBe('png');
    expect(validateImage(file('photo.jpeg', 'image/jpeg', JPEG.length), JPEG)).toBe('jpg');
  });
  it('rejects unsupported extensions even with valid bytes', () => {
    expect(codeOf(() => validateImage(file('photo.gif', 'image/png', PNG.length), PNG))).toBe('UNSUPPORTED_EXTENSION');
    expect(codeOf(() => validateImage(file('evil.svg', 'image/svg+xml', SVG.length), SVG))).toBe('UNSUPPORTED_EXTENSION');
    expect(codeOf(() => validateImage(file('run.exe', 'application/octet-stream', EXE.length), EXE))).toBe('UNSUPPORTED_EXTENSION');
  });
  it('rejects a disallowed declared MIME type', () => {
    expect(codeOf(() => validateImage(file('photo.png', 'text/html', PNG.length), PNG))).toBe('UNSUPPORTED_TYPE');
  });
  it('rejects content that is not an image (renamed file)', () => {
    expect(codeOf(() => validateImage(file('notes.png', 'image/png', EXE.length), EXE))).toBe('INVALID_IMAGE');
  });
  it('rejects extension/content mismatch', () => {
    expect(codeOf(() => validateImage(file('photo.png', 'image/png', JPEG.length), JPEG))).toBe('TYPE_MISMATCH');
  });
  it('rejects empty and oversized files', () => {
    expect(codeOf(() => validateImage(file('a.png', 'image/png', 0), new Uint8Array()))).toBe('EMPTY_FILE');
    expect(codeOf(() => validateImage(file('a.png', 'image/png', 6 * 1024 * 1024), PNG))).toBe('FILE_TOO_LARGE');
  });
});

describe('stored file names', () => {
  it('only accepts server-generated UUID names', () => {
    expect(STORED_NAME_PATTERN.test('0b9f6a2e-4c1d-4e8f-9a7b-1c2d3e4f5a6b.png')).toBe(true);
    for (const bad of ['../.env', '..%2F.env', 'x.png', '0b9f6a2e-4c1d-4e8f-9a7b-1c2d3e4f5a6b.svg', '0b9f6a2e-4c1d-4e8f-9a7b-1c2d3e4f5a6b.png/../../x']) {
      expect(STORED_NAME_PATTERN.test(bad)).toBe(false);
    }
  });
  it('refuses to read traversal paths from storage', async () => {
    expect(await diskStorage.read('../package.json')).toBeNull();
    expect(await diskStorage.read('..\\package.json')).toBeNull();
  });
});

describe('serverless defaults', () => {
  const saved = { ...process.env };
  afterEach(() => {
    for (const k of ['VERCEL', 'NETLIFY', 'AWS_LAMBDA_FUNCTION_NAME', 'UPLOAD_STORAGE', 'MAX_FILE_SIZE_MB']) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('uses database storage and a 4 MB limit on Netlify functions (AWS Lambda) and Vercel', () => {
    for (const [k, v] of [['NETLIFY', 'true'], ['AWS_LAMBDA_FUNCTION_NAME', '___netlify-server-handler'], ['VERCEL', '1']]) {
      for (const x of ['VERCEL', 'NETLIFY', 'AWS_LAMBDA_FUNCTION_NAME']) delete process.env[x];
      process.env[k] = v;
      expect(uploadStorage()).toBe(databaseStorage);
      expect(maxUploadBytes()).toBe(4 * 1024 * 1024);
    }
  });

  it('keeps disk storage and 5 MB locally, and honours explicit settings', () => {
    for (const x of ['VERCEL', 'NETLIFY', 'AWS_LAMBDA_FUNCTION_NAME', 'UPLOAD_STORAGE', 'MAX_FILE_SIZE_MB']) delete process.env[x];
    expect(uploadStorage()).toBe(diskStorage);
    expect(maxUploadBytes()).toBe(5 * 1024 * 1024);
    process.env.UPLOAD_STORAGE = 'database';
    expect(uploadStorage()).toBe(databaseStorage);
  });
});
