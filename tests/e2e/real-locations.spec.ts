import { expect, test } from '@playwright/test';
import { testPrisma } from '../support/test-db';
import { calculateDistance } from '../../src/lib/utils';
import {
  createApprovedDonorAndNgo, expectMarkerAtMapCentre, fillDonationBasics, fixture, login, markerPosition, newPage, PASSWORD, searchAndChoose,
} from './location-helpers';

/**
 * Real-world check against OpenStreetMap Nominatim (needs internet). Opt-in so normal runs never call it:
 *   REAL_GEOCODER=1 PW_CHANNEL=chrome npx playwright test real-locations
 * Four searches plus page loads – well within Nominatim's usage policy (the server throttles to 1 request/second).
 */
test.skip(process.env.REAL_GEOCODER !== '1', 'set REAL_GEOCODER=1 to run against the real OpenStreetMap geocoder');

// Independent reference points (approximate, from published maps) and the name the address must contain.
const LOCATIONS = [
  { query: 'Mansarovar, Jaipur', mustContain: 'Mansarovar', near: { lat: 26.87, lng: 75.76 }, withinKm: 4 },
  { query: 'Hawa Mahal, Jaipur', mustContain: 'Hawa Mahal', near: { lat: 26.9239, lng: 75.8267 }, withinKm: 0.5 },
  { query: 'Jaipur Railway Station', mustContain: 'Railway Station', near: { lat: 26.9196, lng: 75.7878 }, withinKm: 1 },
  { query: 'World Trade Park, Jaipur', mustContain: 'World Trade Park', near: { lat: 26.8536, lng: 75.8050 }, withinKm: 0.5 },
];

test('real Jaipur locations: search, pin, save, reload, NGO and admin views all agree', async ({ browser }) => {
  const tag = Date.now().toString(36);
  const people = await createApprovedDonorAndNgo(tag);
  const donor = await newPage(browser);
  const ngo = await newPage(browser);
  const admin = await newPage(browser);
  await login(donor, people.donor.email, PASSWORD);
  await login(ngo, people.ngo.email, PASSWORD);
  const { adminEmail, adminPassword } = fixture();
  await login(admin, adminEmail, adminPassword);

  await test.step('clicking near Hawa Mahal: pin goes where clicked, address comes from that exact point', async () => {
    await donor.goto('/dashboard/donor/donations/new');
    await searchAndChoose(donor, 'Hawa Mahal, Jaipur');
    const map = donor.getByRole('region', { name: 'Location map' });
    const pin = map.locator('[title="Selected location"]');
    const box = (await map.boundingBox())!;
    const reverse = donor.waitForResponse((r) => r.url().includes('/api/geocode/reverse'));
    await donor.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2 - 60);
    const res = await reverse;
    const asked = new URL(res.url()).searchParams;
    const { result } = await res.json();
    console.log(`[real] map click @ ${asked.get('lat')}, ${asked.get('lng')} → "${result?.address}" (approximate: ${result?.approximate})`);
    expect(await markerPosition(pin)).toEqual({ lat: Number(asked.get('lat')), lng: Number(asked.get('lng')) });
    expect(result).not.toBeNull();
    await expect(donor.locator('#pickup-address')).toHaveValue(result.address);
    expect(result.address).not.toContain('Hawa Mahal'); // ~2 km away at this zoom – the old landmark name must not remain
  });

  for (const loc of LOCATIONS) {
    await test.step(loc.query, async () => {
      const food = `Real location ${loc.mustContain} ${tag}`;
      await donor.goto('/dashboard/donor/donations/new');
      await fillDonationBasics(donor, food);
      const chosen = await searchAndChoose(donor, loc.query);
      const distanceKm = calculateDistance(chosen.latitude, chosen.longitude, loc.near.lat, loc.near.lng);
      console.log(`[real] ${loc.query} → "${chosen.address}" @ ${chosen.latitude}, ${chosen.longitude} (${distanceKm} km from reference)`);

      // The address names the place and the pin is at that place.
      expect(chosen.address).toContain(loc.mustContain);
      expect(distanceKm).toBeLessThan(loc.withinKm);
      const map = donor.getByRole('region', { name: 'Location map' });
      const pin = map.locator('[title="Selected location"]');
      await expect(donor.locator('#pickup-address')).toHaveValue(chosen.address);
      expect(await markerPosition(pin)).toEqual({ lat: chosen.latitude, lng: chosen.longitude });
      await expectMarkerAtMapCentre(map, pin);

      await donor.getByRole('button', { name: 'Publish donation' }).click();
      await donor.waitForURL(/\/dashboard\/donor\/donations\/(?!new)[^/]+$/);
      const saved = await testPrisma().foodDonation.findFirstOrThrow({ where: { foodName: food }, select: { id: true, pickupAddress: true, latitude: true, longitude: true } });
      expect(saved).toMatchObject({ pickupAddress: chosen.address, latitude: chosen.latitude, longitude: chosen.longitude });

      await donor.reload();
      await expect(donor.getByTestId('pickup-address')).toHaveText(saved.pickupAddress);
      expect(await markerPosition(donor.locator('[title="Pickup point"]'))).toEqual({ lat: saved.latitude, lng: saved.longitude });

      await ngo.goto(`/dashboard/ngo/donations/${saved.id}`);
      await expect(ngo.getByTestId('pickup-address')).toHaveText(saved.pickupAddress);
      expect(await markerPosition(ngo.locator(`[title="Pickup: ${people.donor.org}"]`))).toEqual({ lat: saved.latitude, lng: saved.longitude });

      await admin.goto(`/dashboard/admin/donations/${saved.id}`);
      await expect(admin.getByTestId('pickup-address')).toHaveText(saved.pickupAddress);
      expect(await markerPosition(admin.locator(`[title="Pickup: ${people.donor.org}"]`).first())).toEqual({ lat: saved.latitude, lng: saved.longitude });
    });
  }
});
