/** Minimal cookie-aware HTTP client for exercising the API like a browser session would. */
export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3100';

export interface Res<T = any> {
  status: number;
  data: T;
  headers: Headers;
  location: string | null;
}

export class Client {
  private jar = new Map<string, string>();

  constructor(private base = BASE_URL) {}

  get cookieNames() {
    return [...this.jar.keys()];
  }

  private cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1);
      const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || v === '') this.jar.delete(k);
      else this.jar.set(k, v);
    }
  }

  async req<T = any>(method: string, url: string, opts: { json?: unknown; raw?: string; form?: Record<string, string>; body?: BodyInit; headers?: Record<string, string> } = {}): Promise<Res<T>> {
    const headers: Record<string, string> = { cookie: this.cookieHeader(), ...opts.headers };
    let body: BodyInit | undefined = opts.body;
    if (opts.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.json); }
    if (opts.raw !== undefined) { headers['content-type'] = 'application/json'; body = opts.raw; }
    if (opts.form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(opts.form).toString(); }
    const res = await fetch(this.base + url, { method, headers, body, redirect: 'manual' });
    this.store(res);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers, location: res.headers.get('location') };
  }

  get<T = any>(url: string) { return this.req<T>('GET', url); }
  post<T = any>(url: string, json: unknown = {}) { return this.req<T>('POST', url, { json }); }
  put<T = any>(url: string, json: unknown) { return this.req<T>('PUT', url, { json }); }
  patch<T = any>(url: string, json: unknown) { return this.req<T>('PATCH', url, { json }); }

  /** Signs in through NextAuth's credentials flow; returns the error code (if any) and session. */
  async login(email: string, password: string) {
    const csrf = await this.get('/api/auth/csrf');
    const r = await this.req('POST', '/api/auth/callback/credentials', {
      form: { csrfToken: csrf.data.csrfToken, email, password, callbackUrl: this.base + '/' },
    });
    const error = r.location ? new URL(r.location, this.base).searchParams.get('error') : null;
    const session = await this.get('/api/auth/session');
    return { error, session: session.data };
  }

  async upload(fileName: string, bytes: Uint8Array, type: string) {
    const form = new FormData();
    const copy = new Uint8Array(new ArrayBuffer(bytes.length));
    copy.set(bytes);
    form.append('file', new Blob([copy], { type }), fileName);
    return this.req('POST', '/api/uploads', { body: form });
  }
}

/** Smallest valid PNG (1×1 transparent pixel). */
export const PNG_BYTES = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
));
export const JPEG_HEADER = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
