import { describe, expect, it } from 'vitest';
import { donationBody, signedIn } from '../support/factories';
import { testPrisma } from '../support/test-db';

const prisma = testPrisma();

// Latitude and longitude values that cannot be confused: swapping them would put Jaipur (26.9, 75.8)
// at 75.8°N, outside the valid latitude range for a city and easy to spot.
const HAWA_MAHAL = { pickupAddress: 'Hawa Mahal, Amer Road, Ramganj, Jaipur, Rajasthan 302001, India', latitude: 26.923932, longitude: 75.826865 };
const WORLD_TRADE_PARK = { pickupAddress: 'World Trade Park, JLN Marg Flyover, Jaipur, Rajasthan 302018, India', latitude: 26.853981, longitude: 75.805269 };

describe('donation locations', () => {
  it('stores and returns the exact address and coordinates, in the right order, for every role', async () => {
    const donor = await signedIn('DONOR');
    const created = await donor.client.post('/api/donations', donationBody(HAWA_MAHAL));
    expect(created.status).toBe(201);
    expect(created.data).toMatchObject(HAWA_MAHAL);

    const row = await prisma.foodDonation.findUniqueOrThrow({ where: { id: created.data.id } });
    expect(row).toMatchObject(HAWA_MAHAL); // database columns: latitude stays latitude

    const ngo = await signedIn('NGO');
    const admin = await signedIn('ADMIN');
    for (const client of [donor.client, ngo.client, admin.client]) {
      expect((await client.get(`/api/donations/${created.data.id}`)).data).toMatchObject(HAWA_MAHAL);
    }
    const listed = (await ngo.client.get('/api/donations?scope=available&pageSize=50')).data.items.find((d: { id: string }) => d.id === created.data.id);
    expect(listed).toMatchObject(HAWA_MAHAL);
  });

  it('editing the location replaces address and coordinates together', async () => {
    const donor = await signedIn('DONOR');
    const d = (await donor.client.post('/api/donations', donationBody(HAWA_MAHAL))).data;

    // Editing other fields leaves the location exactly as saved.
    expect((await donor.client.patch(`/api/donations/${d.id}`, { foodName: 'Renamed dal' })).status).toBe(200);
    expect(await prisma.foodDonation.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject(HAWA_MAHAL);

    const moved = await donor.client.patch(`/api/donations/${d.id}`, WORLD_TRADE_PARK);
    expect(moved.status).toBe(200);
    expect(await prisma.foodDonation.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject(WORLD_TRADE_PARK);
  });

  it('rejects a new pin without its address (or an address without its pin), and the 0,0 placeholder', async () => {
    const donor = await signedIn('DONOR');
    const d = (await donor.client.post('/api/donations', donationBody(HAWA_MAHAL))).data;
    for (const partial of [
      { latitude: 26.8, longitude: 75.8 },
      { pickupAddress: WORLD_TRADE_PARK.pickupAddress },
      { pickupAddress: WORLD_TRADE_PARK.pickupAddress, latitude: 26.8 },
    ]) {
      const res = await donor.client.patch(`/api/donations/${d.id}`, partial);
      expect(res.status).toBe(400);
    }
    expect((await donor.client.post('/api/donations', donationBody({ latitude: 0, longitude: 0 }))).status).toBe(400);
    expect((await donor.client.post('/api/donations', donationBody({ latitude: 95, longitude: 75.8 }))).status).toBe(400);
    expect((await donor.client.post('/api/donations', donationBody({ latitude: 26.9, longitude: 190 }))).status).toBe(400);
    expect((await donor.client.post('/api/donations', donationBody({ latitude: '26.9', longitude: '75.8' }))).status).toBe(400); // strings are not coerced
    expect(await prisma.foodDonation.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject(HAWA_MAHAL);
  });
});
