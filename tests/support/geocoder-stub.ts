import { createServer, type Server } from 'http';

/**
 * A tiny Nominatim-compatible stand-in so tests never call the real OpenStreetMap service.
 * It knows a few Jaipur places; /search matches by substring, /reverse returns the nearest place
 * within ~3 km (or Nominatim's "Unable to geocode" error). /__stats reports how many calls it served.
 */
export const STUB_PLACES = [
  {
    lat: '26.8504', lon: '75.7623', display_name: 'Shipra Path, Mansarovar, Jaipur, Rajasthan, 302020, India',
    address: { house_number: '12', road: 'Shipra Path', suburb: 'Mansarovar', city: 'Jaipur', state: 'Rajasthan', postcode: '302020', country: 'India' },
  },
  {
    lat: '26.8549', lon: '75.8243', display_name: 'JLN Marg, Malviya Nagar, Jaipur, Rajasthan, 302017, India',
    address: { road: 'JLN Marg', suburb: 'Malviya Nagar', city: 'Jaipur', state: 'Rajasthan', postcode: '302017', country: 'India' },
  },
  {
    lat: '26.9124', lon: '75.7873', display_name: 'C-Scheme, Jaipur, Rajasthan, 302001, India',
    address: { suburb: 'C-Scheme', city: 'Jaipur', state: 'Rajasthan', postcode: '302001', country: 'India' },
  },
  {
    lat: '26.9115', lon: '75.7430', display_name: 'Vaishali Nagar, Jaipur, Rajasthan, 302021, India',
    address: { neighbourhood: 'Vaishali Nagar', city: 'Jaipur', state: 'Rajasthan', postcode: '302021', country: 'India' },
  },
];

export async function startGeocoderStub(port: number) {
  const stats = { search: 0, reverse: 0 };
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const send = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/search') {
      stats.search++;
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const words = q.split(/[\s,]+/).filter((w) => w.length > 2 && w !== 'jaipur');
      return send(STUB_PLACES.filter((p) => words.length > 0 && words.every((w) => p.display_name.toLowerCase().includes(w))));
    }
    if (url.pathname === '/reverse') {
      stats.reverse++;
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      const nearest = STUB_PLACES
        .map((p) => ({ p, d: Math.hypot(Number(p.lat) - lat, Number(p.lon) - lon) }))
        .sort((a, b) => a.d - b.d)[0];
      return send(nearest && nearest.d < 0.03 ? nearest.p : { error: 'Unable to geocode' });
    }
    if (url.pathname === '/__stats') return send(stats);
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise<void>((r) => server.close(() => r())) };
}
