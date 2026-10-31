import { describe, expect, it } from 'vitest';
import { Client } from '../support/http';

// The integration server's geocoder is the local stub started next to it (server port + 1).
const STUB = 'http://127.0.0.1:3101';
const stubStats = async () => (await (await fetch(`${STUB}/__stats`)).json()) as { search: number; reverse: number };

describe('address lookup (/api/geocode)', () => {
  it('search returns readable addresses with the pin behind them – no sign-in needed (used by registration)', async () => {
    const res = await new Client().get('/api/geocode/search?q=Malviya%20Nagar%20Jaipur');
    expect(res.status).toBe(200);
    expect(res.data.results).toEqual([
      { address: 'JLN Marg, Malviya Nagar, Jaipur, Rajasthan 302017, India', area: 'Malviya Nagar, Jaipur', latitude: 26.8549, longitude: 75.8243 },
    ]);
    expect((await new Client().get('/api/geocode/search?q=zzzz-nowhere')).data.results).toEqual([]);
  });

  it('repeated searches are answered from the cache', async () => {
    await new Client().get('/api/geocode/search?q=Vaishali%20Nagar');
    const before = await stubStats();
    expect((await new Client().get('/api/geocode/search?q=vaishali  nagar')).status).toBe(200);
    expect((await stubStats()).search).toBe(before.search);
  });

  it('reverse lookup turns a pin into an address and keeps the exact point', async () => {
    const res = await new Client().get('/api/geocode/reverse?lat=26.912345&lng=75.787654');
    expect(res.status).toBe(200);
    expect(res.data.result).toEqual({
      address: 'C-Scheme, Jaipur, Rajasthan 302001, India', area: 'C-Scheme, Jaipur', latitude: 26.912345, longitude: 75.787654, approximate: false,
    });
    expect((await new Client().get('/api/geocode/reverse?lat=10&lng=10')).data.result).toBeNull();
  });

  it('a pin far from the nearest mapped street gets an area-only address, not that street', async () => {
    // ~1 km from the stub's "JLN Marg, Malviya Nagar" point.
    const res = await new Client().get('/api/geocode/reverse?lat=26.8549&lng=75.8343');
    expect(res.data.result).toMatchObject({ approximate: true, address: 'Malviya Nagar, Jaipur, Rajasthan 302017, India', latitude: 26.8549, longitude: 75.8343 });
  });

  it('rejects bad input before calling the geocoder', async () => {
    const before = await stubStats();
    expect((await new Client().get('/api/geocode/search?q=ab')).status).toBe(400);
    expect((await new Client().get('/api/geocode/search')).status).toBe(400);
    expect((await new Client().get(`/api/geocode/search?q=${'x'.repeat(201)}`)).status).toBe(400);
    expect((await new Client().get('/api/geocode/reverse?lat=91&lng=10')).status).toBe(400);
    expect((await new Client().get('/api/geocode/reverse?lat=abc&lng=10')).status).toBe(400);
    expect(await stubStats()).toEqual(before);
  });
});
