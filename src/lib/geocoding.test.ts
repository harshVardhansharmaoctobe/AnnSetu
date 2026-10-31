import { describe, expect, it } from 'vitest';
import { describePoint, formatPlace } from './geocoding';

// Fixtures are real OpenStreetMap Nominatim responses (jsonv2, addressdetails=1) captured on 2026-10-31.
const HAWA_MAHAL = {
  lat: '26.9239320', lon: '75.8268652', name: 'Hawa Mahal',
  address: { historic: 'Hawa Mahal', road: 'Amer Road', suburb: 'Ramganj', city: 'Jaipur', county: 'Jaipur Tehsil', state_district: 'Jaipur', state: 'Rajasthan', postcode: '302001', country: 'India' },
};
const WORLD_TRADE_PARK = {
  lat: '26.8539805', lon: '75.8052693', name: 'World Trade Park',
  address: { building: 'World Trade Park', road: 'JLN Marg Flyover', city: 'Jaipur Municipal Corporation', county: 'Sanganer Tehsil', state_district: 'Jaipur', state: 'Rajasthan', postcode: '302018', country: 'India' },
};
const RAILWAY_STATION = {
  lat: '26.9181132', lon: '75.7901290', name: 'Railway Station',
  address: { railway: 'Railway Station', road: 'Hasanpura Road', neighbourhood: 'Barodia Scheme , Jaipur', suburb: 'Bani Park', city: 'Jaipur', state: 'Rajasthan', postcode: '302006', country: 'India' },
};
const MANSAROVAR = {
  lat: '26.8756076', lon: '75.7509072', name: 'Mansarovar Sector 4',
  address: { neighbourhood: 'Mansarovar Sector 4', quarter: 'New Aatish Market', suburb: 'Nirman Nagar', city: 'Jaipur Municipal Corporation', state: 'Rajasthan', postcode: '302019', country: 'India' },
};

describe('formatPlace', () => {
  it('names the place itself first, so the text describes what the pin marks', () => {
    expect(formatPlace(HAWA_MAHAL)?.address).toBe('Hawa Mahal, Amer Road, Ramganj, Jaipur, Rajasthan 302001, India');
    expect(formatPlace(WORLD_TRADE_PARK)?.address).toBe('World Trade Park, JLN Marg Flyover, Jaipur, Rajasthan 302018, India');
    expect(formatPlace(RAILWAY_STATION)?.address).toBe('Railway Station, Hasanpura Road, Barodia Scheme, Jaipur, Rajasthan 302006, India');
    expect(formatPlace(MANSAROVAR)?.address).toBe('Mansarovar Sector 4, Jaipur, Rajasthan 302019, India');
  });

  it('keeps latitude and longitude in their own fields (never swapped)', () => {
    expect(formatPlace(HAWA_MAHAL)).toMatchObject({ latitude: 26.923932, longitude: 75.826865, area: 'Ramganj, Jaipur' });
    expect(formatPlace(WORLD_TRADE_PARK)).toMatchObject({ latitude: 26.853981, longitude: 75.805269 });
  });

  it('builds a readable address from parts, skipping missing and repeated ones', () => {
    const p = formatPlace({
      lat: '26.85041', lon: '75.76234',
      address: { house_number: '123', road: 'Shipra Path', suburb: 'Mansarovar', city: 'Jaipur', state: 'Rajasthan', postcode: '302020', country: 'India' },
    });
    expect(p).toEqual({ address: '123, Shipra Path, Mansarovar, Jaipur, Rajasthan 302020, India', area: 'Mansarovar, Jaipur', latitude: 26.85041, longitude: 75.76234 });
    expect(formatPlace({ lat: '1', lon: '2', address: { city: 'Jaipur', county: 'Jaipur', state: 'Rajasthan' } })?.address).toBe('Jaipur, Rajasthan');
  });

  it('falls back to the display name and rejects invalid points', () => {
    expect(formatPlace({ lat: '26.9', lon: '75.7', display_name: 'Hawa Mahal, Jaipur' })?.address).toBe('Hawa Mahal, Jaipur');
    expect(formatPlace({ lat: 'x', lon: '75.7', display_name: 'Nowhere' })).toBeNull();
    expect(formatPlace({ lat: '95', lon: '75.7', display_name: 'Nowhere' })).toBeNull();
  });
});

describe('describePoint (reverse lookup)', () => {
  it('uses the street-level address when the nearest mapped object is at the pin', () => {
    const p = describePoint(HAWA_MAHAL, 26.92395, 75.82690);
    expect(p).toMatchObject({ approximate: false, address: 'Hawa Mahal, Amer Road, Ramganj, Jaipur, Rajasthan 302001, India' });
  });

  it('falls back to the area when the nearest mapped object is far from the pin', () => {
    const p = describePoint(HAWA_MAHAL, 26.9280, 75.8268); // ~450 m north of Hawa Mahal
    expect(p).toMatchObject({ approximate: true, address: 'Ramganj, Jaipur, Rajasthan 302001, India' });
    expect(p?.address).not.toContain('Hawa Mahal');
  });
});
