import { afterEach, describe, expect, it } from 'vitest';
import { clientIp } from './api';

const req = (headers: Record<string, string>) => new Request('http://localhost/api/x', { headers });

describe('clientIp', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    delete process.env.CLIENT_IP_HEADER;
  });

  it('uses the platform header when configured (Netlify), and only then', () => {
    const headers = { 'x-nf-client-connection-ip': '203.0.113.50', 'x-forwarded-for': '6.6.6.6, 203.0.113.50, 100.64.0.1' };
    // Not configured: the header is ignored (a client could send it on other hosts).
    expect(clientIp(req({ 'x-nf-client-connection-ip': '6.6.6.6' }))).toBe('unknown');
    process.env.CLIENT_IP_HEADER = 'x-nf-client-connection-ip';
    expect(clientIp(req(headers))).toBe('203.0.113.50');
    // Configured but missing: falls back to the trusted X-Forwarded-For logic.
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 198.51.100.4' }))).toBe('198.51.100.4');
  });

  it('ignores a client-supplied X-Forwarded-For prefix (one trusted proxy by default)', () => {
    // The client sent "X-Forwarded-For: 6.6.6.6"; the platform proxy appended the real address.
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('a spoofed header cannot create fresh rate-limit keys', () => {
    const keys = new Set(['10.0.0.1', '10.0.0.2', '10.0.0.3'].map((fake) => clientIp(req({ 'x-forwarded-for': `${fake}, 198.51.100.4` }))));
    expect([...keys]).toEqual(['198.51.100.4']);
  });

  it('honours the configured number of trusted proxies', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 10.1.1.1' }))).toBe('203.0.113.7');
    process.env.TRUSTED_PROXY_HOPS = '0';
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.7' }))).toBe('unknown');
  });

  it('falls back to x-real-ip, then to a shared key', () => {
    expect(clientIp(req({ 'x-real-ip': '192.0.2.9' }))).toBe('192.0.2.9');
    expect(clientIp(req({}))).toBe('unknown');
  });
});
