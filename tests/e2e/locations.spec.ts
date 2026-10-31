import { expect, test } from '@playwright/test';
import { testPrisma } from '../support/test-db';
import {
  createApprovedDonorAndNgo, expectMarkerAtMapCentre, fillDonationBasics, fixture, login, markerPosition, newPage, PASSWORD, searchAndChoose,
} from './location-helpers';

// Address ↔ pin synchronisation with the local geocoder stub (the real-service run is real-locations.spec.ts).
test.skip(process.env.REAL_GEOCODER === '1', 'runs against the geocoder stub only');

test('location picker keeps address and pin together: search, click, drag, failed lookup, save, edit, other roles', async ({ browser }) => {
  const tag = Date.now().toString(36);
  const FOOD = `Location test dal ${tag}`;
  const people = await createApprovedDonorAndNgo(tag);
  const donor = await newPage(browser);
  await login(donor, people.donor.email, PASSWORD);
  await donor.goto('/dashboard/donor/donations/new');
  await fillDonationBasics(donor, FOOD);

  const map = donor.getByRole('region', { name: 'Location map' });
  const pin = map.locator('[title="Selected location"]');
  const address = donor.locator('#pickup-address');

  await test.step('the form starts from the donor profile location, not a default', async () => {
    await expect(address).toHaveValue('Mansarovar, Jaipur, Rajasthan 302020');
    expect(await markerPosition(pin)).toEqual({ lat: 26.8505, lng: 75.7646 });
  });

  await test.step('A: choosing a search result moves the pin to exactly that result', async () => {
    const chosen = await searchAndChoose(donor, 'Malviya Nagar');
    await expect(address).toHaveValue(chosen.address);
    expect(await markerPosition(pin)).toEqual({ lat: chosen.latitude, lng: chosen.longitude });
    expect(chosen).toMatchObject({ latitude: 26.8549, longitude: 75.8243 }); // latitude ~26.85, longitude ~75.82 – not swapped
    await expectMarkerAtMapCentre(map, pin);
  });

  await test.step('B: clicking the map moves the pin there and replaces the address with the one for that point', async () => {
    const box = (await map.boundingBox())!;
    const reverse = donor.waitForResponse((r) => r.url().includes('/api/geocode/reverse'));
    await donor.mouse.click(box.x + box.width / 2 + 90, box.y + box.height / 2 + 40);
    const res = await reverse;
    const asked = new URL(res.url()).searchParams;
    const { result } = await res.json();
    expect(await markerPosition(pin)).toEqual({ lat: Number(asked.get('lat')), lng: Number(asked.get('lng')) });
    await expect(address).toHaveValue(result.address);
    // The stub's nearest place is >150 m from the click, so only the area is used – no street that is not at the pin.
    expect(result.approximate).toBe(true);
    expect(result.address).not.toContain('JLN Marg');
  });

  await test.step('C: dragging the pin updates the coordinates and the address', async () => {
    const before = await markerPosition(pin);
    const box = (await pin.boundingBox())!;
    const reverse = donor.waitForResponse((r) => r.url().includes('/api/geocode/reverse'));
    await donor.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await donor.mouse.down();
    await donor.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 30, { steps: 8 });
    await donor.mouse.up();
    const res = await reverse;
    const asked = new URL(res.url()).searchParams;
    const after = await markerPosition(pin);
    expect(after).not.toEqual(before);
    expect(after).toEqual({ lat: Number(asked.get('lat')), lng: Number(asked.get('lng')) });
    await expect(address).toHaveValue((await res.json()).result.address);
  });

  await test.step('a failed lookup never leaves the old address next to the new pin', async () => {
    await donor.route('**/api/geocode/reverse**', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Address lookup is unavailable right now.', code: 'GEOCODING_UNAVAILABLE' }) }));
    const box = (await map.boundingBox())!;
    await donor.mouse.click(box.x + box.width / 2 - 40, box.y + box.height / 2 + 50);
    await expect(donor.getByRole('button', { name: 'Retry address lookup' })).toBeVisible();
    await expect(address).toHaveValue('');
    await donor.getByRole('button', { name: 'Publish donation' }).click();
    await expect(donor.getByText('Pickup address is required')).toBeVisible(); // blocked, nothing saved
    await donor.unroute('**/api/geocode/reverse**');
    await donor.getByRole('button', { name: 'Retry address lookup' }).click();
    await expect(address).not.toHaveValue('');
  });

  let saved: { pickupAddress: string; latitude: number; longitude: number; id: string };
  await test.step('saving stores exactly the selected address and pin', async () => {
    const chosen = await searchAndChoose(donor, 'Vaishali Nagar');
    await donor.getByRole('button', { name: 'Publish donation' }).click();
    await donor.waitForURL(/\/dashboard\/donor\/donations\/(?!new)[^/]+$/);
    saved = await testPrisma().foodDonation.findFirstOrThrow({ where: { foodName: FOOD }, select: { id: true, pickupAddress: true, latitude: true, longitude: true } });
    expect(saved).toMatchObject({ pickupAddress: chosen.address, latitude: chosen.latitude, longitude: chosen.longitude });
  });

  await test.step('after a reload the donor sees the same address and marker', async () => {
    await donor.reload();
    await expect(donor.getByTestId('pickup-address')).toHaveText(saved.pickupAddress);
    const marker = donor.getByRole('region', { name: 'Pickup and requesting NGOs' }).locator('[title="Pickup point"]');
    expect(await markerPosition(marker)).toEqual({ lat: saved.latitude, lng: saved.longitude });
  });

  await test.step('D: editing loads the saved location, keeps it when untouched, and replaces it as a pair', async () => {
    await donor.getByRole('button', { name: 'Edit' }).click();
    await expect(address).toHaveValue(saved.pickupAddress);
    expect(await markerPosition(pin)).toEqual({ lat: saved.latitude, lng: saved.longitude });
    await donor.getByLabel('Food title').fill(`${FOOD} (edited)`);
    await donor.getByRole('button', { name: 'Save changes' }).click();
    await expect(donor.getByRole('heading', { name: `${FOOD} (edited)` })).toBeVisible();
    expect(await testPrisma().foodDonation.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({
      pickupAddress: saved.pickupAddress, latitude: saved.latitude, longitude: saved.longitude,
    });

    await donor.getByRole('button', { name: 'Edit' }).click();
    const chosen = await searchAndChoose(donor, 'C-Scheme');
    await donor.getByRole('button', { name: 'Save changes' }).click();
    await expect(donor.getByTestId('pickup-address')).toHaveText(chosen.address);
    saved = { id: saved.id, ...(await testPrisma().foodDonation.findUniqueOrThrow({ where: { id: saved.id }, select: { pickupAddress: true, latitude: true, longitude: true } })) };
    expect(saved).toMatchObject({ pickupAddress: chosen.address, latitude: chosen.latitude, longitude: chosen.longitude });
  });

  await test.step('E: NGO and admin see the same saved address and marker', async () => {
    const ngo = await newPage(browser);
    await login(ngo, people.ngo.email, PASSWORD);
    await ngo.goto(`/dashboard/ngo/donations/${saved.id}`);
    await expect(ngo.getByTestId('pickup-address')).toHaveText(saved.pickupAddress);
    const ngoMarker = ngo.getByRole('region', { name: 'Pickup location map' }).locator(`[title="Pickup: ${people.donor.org}"]`);
    expect(await markerPosition(ngoMarker)).toEqual({ lat: saved.latitude, lng: saved.longitude });

    const admin = await newPage(browser);
    const { adminEmail, adminPassword } = fixture();
    await login(admin, adminEmail, adminPassword);
    await admin.goto(`/dashboard/admin/donations/${saved.id}`);
    await expect(admin.getByTestId('pickup-address')).toHaveText(saved.pickupAddress);
    const adminMarker = admin.getByRole('region', { name: 'Donation and requesting NGOs' }).locator(`[title="Pickup: ${people.donor.org}"]`);
    expect(await markerPosition(adminMarker)).toEqual({ lat: saved.latitude, lng: saved.longitude });
  });
});
