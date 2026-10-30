'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Error thrown by `api()` with the server's safe message and optional code/field details. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }

  /** Field errors from zod's flatten(), if any. */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | Record<string, string[]> | undefined;
    if (!d) return {};
    return ('fieldErrors' in d ? d.fieldErrors : d) as Record<string, string[]>;
  }
}

export async function api<T = unknown>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiClientError('Network error – check your connection and try again.', 0, 'NETWORK');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(data?.error ?? `Request failed (${response.status})`, response.status, data?.code, data?.details);
  }
  return data as T;
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  let response: Response;
  try {
    response = await fetch('/api/uploads', { method: 'POST', body: form });
  } catch {
    throw new ApiClientError('Upload failed – check your connection.', 0, 'NETWORK');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiClientError(data?.error ?? 'Upload failed', response.status, data?.code);
  return data.url as string;
}

/** Loads JSON from an API route; `reload()` refetches. Pass null to skip loading. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const call = ++latest.current;
    setLoading(true);
    try {
      const result = await api<T>(url);
      if (call === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (call === latest.current) setError(e as ApiClientError);
    } finally {
      if (call === latest.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function toQuery(params: Record<string, string | number | undefined | null | boolean>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
