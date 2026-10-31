import { readFileSync } from 'fs';
import bcrypt from 'bcryptjs';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { testPrisma } from '../support/test-db';

export const PASSWORD = 'LocationPass123!';
export const fixture = () => JSON.parse(readFileSync('test-results/e2e-fixture.json', 'utf8')) as { adminEmail: string; adminPassword: string };

/** An approved donor (profile in Mansarovar) and an approved NGO (Malviya Nagar), created directly in the test DB. */
export async function createApprovedDonorAndNgo(tag: string) {
  const prisma = testPrisma();
  const password = await bcrypt.hash(PASSWORD, 10);
  const donor = await prisma.user.create({
    data: {
      email: `loc.donor.${tag}@fbtest.invalid`, name: `Loc Donor ${tag}`, password, role: 'DONOR', accountStatus: 'APPROVED',
      donorProfile: { create: { organisationName: `Loc Kitchen ${tag}`, organisationType: 'restaurant', address: 'Mansarovar, Jaipur, Rajasthan 302020', latitude: 26.8505, longitude: 75.7646 } },
    },
  });
  const ngo = await prisma.user.create({
    data: {
      email: `loc.ngo.${tag}@fbtest.invalid`, name: `Loc NGO ${tag}`, password, role: 'NGO', accountStatus: 'APPROVED',
      ngoProfile: { create: { organisationName: `Loc NGO ${tag}`, address: 'Malviya Nagar, Jaipur, Rajasthan 302017', latitude: 26.8553, longitude: 75.8057 } },
    },
  });
  return { donor: { email: donor.email, org: `Loc Kitchen ${tag}` }, ngo: { email: ngo.email } };
}

export async function newPage(browser: Browser) {
  const context = await browser.newContext();
  // Map tiles are external images; the marker positions do not depend on them.
  await context.route('https://*.tile.openstreetmap.org/**', (route) => route.abort());
  return context.newPage();
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard\//);
}

/** The exact [lat, lng] Leaflet was given for a marker (MapView tags each marker element). */
export async function markerPosition(marker: Locator) {
  await expect(marker).toBeVisible();
  const [lat, lng] = await Promise.all([marker.getAttribute('data-lat'), marker.getAttribute('data-lng')]);
  return { lat: Number(lat), lng: Number(lng) };
}

/**
 * After a location is selected the map centres on it, so the marker must sit at the map's centre on screen.
 * This catches markers drawn at the wrong place (e.g. swapped coordinates) even when the numbers look right.
 */
export async function expectMarkerAtMapCentre(map: Locator, marker: Locator) {
  await expect.poll(async () => {
    const [m, k] = await Promise.all([map.boundingBox(), marker.boundingBox()]);
    if (!m || !k) return Infinity;
    return Math.hypot(m.x + m.width / 2 - (k.x + k.width / 2), m.y + m.height / 2 - (k.y + k.height / 2));
  }, { timeout: 10_000 }).toBeLessThan(4);
}

/** Search in the location picker and pick the first result; returns exactly what the server returned for it. */
export async function searchAndChoose(page: Page, query: string) {
  const response = page.waitForResponse((r) => r.url().includes('/api/geocode/search'));
  await page.getByLabel('Find the address').fill(query);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  const { results } = (await (await response).json()) as { results: { address: string; latitude: number; longitude: number }[] };
  expect(results.length, `no geocoder results for "${query}"`).toBeGreaterThan(0);
  await page.getByTestId('address-result').first().click();
  return results[0];
}

export async function fillDonationBasics(page: Page, food: string) {
  await page.getByLabel('Food title').fill(food);
  await page.getByLabel('Quantity').fill('25');
  await page.getByLabel('Storage conditions').fill('Hot-held in sealed trays');
  await page.locator('#foodSafetyDeclared').check();
}
