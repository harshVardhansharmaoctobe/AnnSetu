import { readFileSync } from 'fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { testPrisma } from '../support/test-db';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const fixture = () => JSON.parse(readFileSync('test-results/e2e-fixture.json', 'utf8')) as { adminEmail: string; adminPassword: string };
const run = Date.now().toString(36);
const PASSWORD = 'DemoPass123!';
const people = {
  donor: { name: 'Asha Donor', email: `donor.${run}@fbtest.invalid`, org: `Rasoi ${run}` },
  ngo: { name: 'Ravi NGO', email: `ngo.${run}@fbtest.invalid`, org: `Annapurna ${run}` },
  volunteer: { name: `Priya Volunteer ${run}`, email: `vol.${run}@fbtest.invalid` },
};
const FOOD = `E2E Veg Biryani ${run}`;

async function newPage(browser: Browser, geolocation?: { latitude: number; longitude: number }) {
  const context = await browser.newContext(geolocation ? { geolocation, permissions: ['geolocation'] } : {});
  // Map tiles are external; block them so the test never depends on the internet.
  await context.route('https://*.tile.openstreetmap.org/**', (route) => route.abort());
  return context.newPage();
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard\//);
}

async function register(page: Page, role: 'DONOR' | 'NGO' | 'VOLUNTEER', who: { name: string; email: string }) {
  await page.goto('/register');
  await page.getByTestId(`role-${role}`).click();
  await page.getByLabel('Full name').fill(who.name);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Phone (optional)').fill('+91 90000 12345');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/dashboard/profile');
}

/** Address search as a user does it: type, Find, pick the match. The server's geocoder is a local stub. */
async function setLocation(page: Page, query: string, expectedAddress: string) {
  await page.getByLabel('Find the address').fill(query);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByTestId('address-result').filter({ hasText: expectedAddress }).click();
  await expect(page.locator('#loc-address')).toHaveValue(expectedAddress);
  await expect(page.getByTestId('loc-pinned')).toBeVisible();
  // No raw coordinates in the visible text (the manual-entry fields are inputs inside a closed <details>).
  await expect(page.getByTestId('loc-picker')).not.toContainText(/\b26\.\d{3,}/);
}

test('full food rescue: registration → approval → donation → request → delivery → impact', async ({ browser }) => {
  const { adminEmail, adminPassword } = fixture();
  const donor = await newPage(browser);
  const ngo = await newPage(browser);
  const volunteer = await newPage(browser, { latitude: 26.9116, longitude: 75.7431 }); // Vaishali Nagar
  const admin = await newPage(browser);

  await test.step('donor, NGO and volunteer register and complete their profiles', async () => {
    await register(donor, 'DONOR', people.donor);
    await donor.getByLabel('Organisation / business name').fill(people.donor.org);
    await setLocation(donor, 'Mansarovar', '12, Shipra Path, Mansarovar, Jaipur, Rajasthan 302020, India');
    await donor.getByTestId('avatar-photo').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    await expect(donor.getByAltText('Uploaded')).toBeVisible();
    await donor.getByRole('button', { name: 'Save profile' }).click();
    await expect(donor.getByText('Profile saved')).toBeVisible();
    const saved = await testPrisma().user.findUniqueOrThrow({ where: { email: people.donor.email }, select: { avatarUrl: true } });
    expect(saved.avatarUrl).toMatch(/^\/api\/uploads\//);

    await register(ngo, 'NGO', people.ngo);
    await ngo.getByLabel('NGO name').fill(people.ngo.org);
    await setLocation(ngo, 'Malviya Nagar Jaipur', 'JLN Marg, Malviya Nagar, Jaipur, Rajasthan 302017, India');
    await ngo.getByRole('button', { name: 'Save profile' }).click();
    await expect(ngo.getByText('Profile saved')).toBeVisible();

    await register(volunteer, 'VOLUNTEER', people.volunteer);
    // The volunteer uses the device location; the address is filled in by reverse lookup.
    await volunteer.getByRole('button', { name: 'My location' }).click();
    await expect(volunteer.locator('#loc-address')).toHaveValue('Vaishali Nagar, Jaipur, Rajasthan 302021, India');
    await expect(volunteer.getByTestId('loc-pinned')).toBeVisible();
    await volunteer.getByRole('button', { name: 'Save profile' }).click();
    await expect(volunteer.getByText('Profile saved')).toBeVisible();

    // Pending accounts are held at the status page and cannot open operational pages.
    await donor.goto('/dashboard/donor/donations/new');
    await expect(donor).toHaveURL(/\/dashboard\/pending/);
    await expect(donor.getByTestId('account-status-heading')).toHaveText('Your account is awaiting approval');
  });

  await test.step('admin approves the three accounts', async () => {
    await login(admin, adminEmail, adminPassword);
    await expect(admin).toHaveURL(/\/dashboard\/admin/);
    for (const who of [people.donor, people.ngo, people.volunteer]) {
      const row = admin.getByTestId('pending-user').filter({ hasText: who.email });
      await row.getByRole('button', { name: 'Approve' }).click();
      await expect(row).toHaveCount(0);
    }
  });

  await test.step('donor creates a donation with a photo', async () => {
    await donor.goto('/dashboard');
    await expect(donor).toHaveURL(/\/dashboard\/donor$/);
    await donor.goto('/dashboard/donor/donations/new');
    await donor.getByLabel('Food title').fill(FOOD);
    await donor.getByLabel('Quantity').fill('50');
    await donor.getByLabel('Storage conditions').fill('Hot-held in sealed trays');
    await donor.getByLabel('Special handling instructions').fill('Keep upright');
    await donor.getByTestId('donation-photo').setInputFiles({ name: 'biryani.png', mimeType: 'image/png', buffer: PNG });
    await expect(donor.getByAltText('Uploaded')).toBeVisible();
    await donor.locator('#foodSafetyDeclared').check();
    await donor.getByRole('button', { name: 'Publish donation' }).click();
    await donor.waitForURL(/\/dashboard\/donor\/donations\/(?!new)[^/]+$/);
    await expect(donor.getByRole('heading', { name: FOOD })).toBeVisible();
  });

  await test.step('NGO discovers the donation on the map and requests it', async () => {
    await ngo.goto('/dashboard');
    await expect(ngo).toHaveURL(/\/dashboard\/ngo$/);
    await ngo.goto('/dashboard/ngo/browse');
    const card = ngo.getByTestId('donation-card').filter({ hasText: FOOD });
    await expect(card).toContainText('km away'); // real distance from the NGO profile location

    await ngo.getByRole('button', { name: 'Map' }).click();
    const map = ngo.getByRole('region', { name: 'Map of available donations' });
    await expect(map.locator('[title="Your NGO"]')).toBeVisible(); // the NGO's own saved location
    await map.locator(`[title="${FOOD}"]`).click();                // the donation's pickup marker
    await map.getByRole('link', { name: FOOD }).click();            // popup link
    await ngo.waitForURL(/\/dashboard\/ngo\/donations\/[^/]+$/);
    await expect(ngo.getByRole('heading', { name: FOOD })).toBeVisible();
    await ngo.locator('#requestedQuantity').fill('20');
    await ngo.locator('#beneficiaryCount').fill('40');
    await ngo.getByRole('button', { name: 'Send request' }).click();
    await ngo.waitForURL(/\/dashboard\/ngo\/requests\/[^/]+$/);
    await expect(ngo.getByText('Pending').first()).toBeVisible();
  });

  await test.step('donor approves the request: 20 of 50 reserved, 30 still available', async () => {
    await donor.goto('/dashboard/donor');
    const request = donor.getByTestId('donor-request').filter({ hasText: people.ngo.org });
    await request.getByRole('button', { name: 'Approve' }).click();
    await expect(donor.getByText('Request approved')).toBeVisible();
    await donor.goto('/dashboard/donor/donations');
    await expect(donor.getByRole('link', { name: new RegExp(FOOD) })).toContainText('30 of 50 meals unreserved');

    // The public landing page shows the tagline and the listing with what is still available.
    await donor.goto('/');
    await expect(donor.getByTestId('tagline')).toHaveText('From Surplus to Served.');
    await expect(donor.getByTestId('featured-donation').filter({ hasText: FOOD })).toContainText('30 meals available');
  });

  await test.step('admin assigns the volunteer', async () => {
    await admin.goto('/dashboard/admin/deliveries');
    const row = admin.getByTestId('delivery-row').filter({ hasText: FOOD });
    await row.getByRole('button', { name: 'Assign' }).click();
    const option = admin.getByTestId('volunteer-option').filter({ hasText: people.volunteer.name });
    await option.getByRole('button', { name: 'Assign' }).click();
    await expect(admin.getByText('Volunteer assigned')).toBeVisible();
  });

  await test.step('volunteer receives and accepts the assignment', async () => {
    await volunteer.goto('/dashboard/notifications');
    await expect(volunteer.getByTestId('notification').filter({ hasText: 'New delivery assigned to you' })).toBeVisible();
    await volunteer.goto('/dashboard');
    await expect(volunteer).toHaveURL(/\/dashboard\/volunteer/);
    // The dashboard opens on "My assignments" because the volunteer has an offer waiting.
    await volunteer.getByTestId('assignment-card').filter({ hasText: FOOD }).click();
    await expect(volunteer.getByText('An admin asked you to take this delivery')).toBeVisible();
    await volunteer.getByRole('button', { name: 'Accept' }).click();
    await expect(volunteer.getByText('Delivery accepted')).toBeVisible();
  });

  await test.step('volunteer sees both locations, arrives, collects with pickup proof, travels and delivers with proof', async () => {
    const map = volunteer.getByRole('region', { name: 'Pickup and drop-off map' });
    await expect(map.locator(`[title="Pickup: ${people.donor.org}"]`)).toBeVisible();
    await expect(map.locator(`[title="Drop-off: ${people.ngo.org}"]`)).toBeVisible();

    await volunteer.getByRole('button', { name: 'I have arrived at pickup' }).click();
    await expect(volunteer.getByText('Arrival recorded – the donor has been notified')).toBeVisible();

    await volunteer.getByTestId('pickup-photo').setInputFiles({ name: 'pickup.png', mimeType: 'image/png', buffer: PNG });
    await expect(volunteer.getByAltText('Uploaded')).toBeVisible();
    await volunteer.getByRole('button', { name: 'I have collected the food' }).click();
    await expect(volunteer.getByText('Pickup confirmed')).toBeVisible();

    await volunteer.getByRole('button', { name: 'Mark in transit' }).click();
    await expect(volunteer.getByText('Marked in transit – the NGO has been notified')).toBeVisible();

    await expect(volunteer.getByRole('button', { name: 'Mark as delivered' })).toBeDisabled(); // proof required
    await volunteer.getByTestId('delivery-photo').setInputFiles({ name: 'handover.png', mimeType: 'image/png', buffer: PNG });
    await expect(volunteer.getByAltText('Uploaded')).toBeVisible();
    await volunteer.locator('#deliveredQuantity').fill('20');
    await volunteer.getByRole('button', { name: 'Mark as delivered' }).click();
    await expect(volunteer.getByText('Delivery completed – the NGO will confirm receipt')).toBeVisible();
  });

  await test.step('NGO confirms receipt with feedback and impact is recorded', async () => {
    await ngo.reload();
    await ngo.getByRole('button', { name: 'Confirm receipt' }).click();
    const dialog = ngo.getByRole('dialog');
    await dialog.getByRole('radio', { name: '5 stars' }).click();
    await dialog.getByLabel('Feedback for the donor and volunteer (optional)').fill('Hot and on time, thank you!');
    await dialog.getByTestId('confirm-receipt-submit').click();
    await expect(ngo.getByText('Impact recorded: ≈ 20 meals')).toBeVisible();
  });

  await test.step('database records hold the exact final quantities', async () => {
    const prisma = testPrisma();
    const donation = await prisma.foodDonation.findFirstOrThrow({
      where: { foodName: FOOD },
      include: { requests: { include: { assignments: true, proofs: true, impact: true } } },
    });
    expect(donation).toMatchObject({ quantity: 50, remainingQuantity: 30, status: 'PARTIALLY_RESERVED' });
    expect(donation.requests).toHaveLength(1);
    const [request] = donation.requests;
    expect(request).toMatchObject({ requestedQuantity: 20, deliveredQuantity: 20, status: 'COMPLETED', feedbackRating: 5 });
    expect(request.assignments.map((a) => a.status)).toEqual(['COMPLETED']);
    expect(request.proofs.map((p) => p.type).sort()).toEqual(['DELIVERY', 'PICKUP']);
    expect(request.proofs.every((p) => p.photoUrl?.startsWith('/api/uploads/'))).toBe(true);
    expect(request.impact).toMatchObject({ mealsRescued: 20 });
  });

  await test.step('admin sees the completed delivery and live impact numbers', async () => {
    await admin.goto('/dashboard/admin/deliveries');
    await admin.getByRole('button', { name: 'Completed' }).click();
    const row = admin.getByTestId('delivery-row').filter({ hasText: FOOD });
    await expect(row).toContainText('Completed');
    await row.getByRole('link', { name: FOOD }).click();
    await expect(admin.getByText('Delivery proof')).toBeVisible();

    await admin.goto('/dashboard/impact');
    const panel = admin.getByTestId('impact-panel');
    await expect(panel.getByText('Total food listed').locator('..').locator('..')).toContainText('50 meals');
    await expect(panel.getByText('Available now').locator('..').locator('..')).toContainText('30 meals');
    await expect(panel.getByText('Food delivered (verified)').locator('..').locator('..')).toContainText('20 meals');
    // The stat card label is a <p>; the trend chart legend uses the same words in a <span>.
    await expect(panel.locator('p').getByText('Verified deliveries', { exact: true }).locator('..').locator('..')).toContainText('1');
    await expect(panel.getByText('Meals served (est.)').locator('..').locator('..')).toContainText('20');
    await expect(panel.getByTestId('impact-demo')).toContainText('No demo records are included');
  });

  await test.step('admin command center: role totals, user detail, map layers, donation detail', async () => {
    await admin.goto('/dashboard/admin');
    const roles = admin.getByTestId('users-by-role');
    await expect(roles.getByText('Donors').locator('..').locator('..')).toContainText('1');
    await expect(roles.getByText('Volunteers').locator('..').locator('..')).toContainText('1');

    const map = admin.getByRole('region', { name: 'Platform locations' });
    await expect(map.locator(`[title="${people.donor.org}"]`)).toBeVisible();
    await admin.getByTestId('layer-donors').uncheck();
    await expect(map.locator(`[title="${people.donor.org}"]`)).toHaveCount(0);
    await expect(map.locator(`[title="${people.ngo.org}"]`)).toBeVisible();

    await admin.goto('/dashboard/admin/users');
    await admin.getByRole('link', { name: people.donor.name }).click();
    await expect(admin.getByRole('heading', { name: people.donor.name })).toBeVisible();
    await expect(admin.getByText(people.donor.org)).toBeVisible();

    await admin.goto('/dashboard/admin/donations');
    await admin.getByRole('link', { name: FOOD }).click();
    const quantities = admin.getByTestId('donation-quantities');
    await expect(quantities.getByText('Listed').locator('..').locator('..')).toContainText('50 meals');
    await expect(quantities.getByText('Reserved', { exact: true }).locator('..').locator('..')).toContainText('0 meals');
    await expect(quantities.getByText('Delivered (verified)').locator('..').locator('..')).toContainText('20 meals');
    await expect(quantities.getByText('Still available').locator('..').locator('..')).toContainText('30 meals');
    await expect(admin.getByTestId('admin-donation-request')).toContainText(people.ngo.org);
  });

  await test.step('notifications reached the right people', async () => {
    await donor.goto('/dashboard/notifications');
    await expect(donor.getByTestId('notification').filter({ hasText: 'Food received' })).toBeVisible();
    await donor.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(donor.getByTestId('unread-badge')).toHaveCount(0);
  });

  await test.step('logout ends the session', async () => {
    await donor.getByTestId('user-menu').click();
    await donor.getByRole('menuitem', { name: 'Sign out' }).click();
    await donor.waitForURL((url) => url.pathname === '/');
    await donor.goto('/dashboard');
    await expect(donor).toHaveURL(/\/login/);
  });
});

test('role pages are protected for the wrong role', async ({ browser }) => {
  const page = await newPage(browser);
  await login(page, fixture().adminEmail, fixture().adminPassword);
  await page.goto('/dashboard/donor');
  await expect(page).toHaveURL(/\/dashboard\/admin$/); // admin is redirected to its own dashboard
});
