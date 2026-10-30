/**
 * FoodBridge local demo seed – `npm run db:seed`
 *
 * Safe by design:
 *  - refuses to run when NODE_ENV=production
 *  - passwords come only from SEED_ADMIN_PASSWORD / SEED_DEMO_PASSWORD in your local .env
 *  - idempotent: existing users are never modified; demo donations are created once and only
 *    refreshed (new deadlines) while untouched by any NGO request
 *  - every demo record is labelled ("[Demo]" donations, @foodbridge.local accounts)
 *
 * Demo donor/NGO/volunteer start PENDING so the admin approval step can be demonstrated.
 * Set SEED_DEMO_APPROVED=true to create them already approved.
 */
import { writeFileSync } from 'fs';
import { loadEnvConfig } from '@next/env';
import bcrypt from 'bcryptjs';
import { PrismaClient, type AccountStatus, type Prisma, type UserRole } from '@prisma/client';

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const HOUR = 3_600_000;

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const JAIPUR = {
  mansarovar: { lat: 26.8505, lng: 75.7646, address: 'Mansarovar, Jaipur, Rajasthan 302020' },
  malviyaNagar: { lat: 26.8553, lng: 75.8057, address: 'Malviya Nagar, Jaipur, Rajasthan 302017' },
  cScheme: { lat: 26.9012, lng: 75.7985, address: 'C-Scheme, Jaipur, Rajasthan 302001' },
  vaishaliNagar: { lat: 26.9104, lng: 75.7354, address: 'Vaishali Nagar, Jaipur, Rajasthan 302021' },
};

async function ensureUser(
  email: string,
  data: { name: string; role: UserRole; accountStatus: AccountStatus; phone?: string },
  passwordHash: string,
  profile?: (userId: string) => Promise<unknown>
) {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, accountStatus: true, isDemo: true } });
  if (existing) {
    if (existing.role !== data.role) fail(`${email} already exists with role ${existing.role}; refusing to change it`);
    if (!existing.isDemo) {
      // Accounts created by an earlier version of this seed predate the isDemo flag; label them only.
      await prisma.user.update({ where: { id: existing.id }, data: { isDemo: true } });
      console.log(`  • ${email.padEnd(32)} exists (${existing.accountStatus}) – labelled as demo, otherwise unchanged`);
    } else {
      console.log(`  • ${email.padEnd(32)} exists (${existing.accountStatus}) – left unchanged`);
    }
    return existing.id;
  }
  const user = await prisma.user.create({ data: { email, password: passwordHash, isDemo: true, ...data } });
  if (profile) await profile(user.id);
  console.log(`  • ${email.padEnd(32)} created (${data.role}, ${data.accountStatus})`);
  return user.id;
}

async function main() {
  if (process.env.NODE_ENV === 'production') fail('Refusing to seed demo data when NODE_ENV=production.');

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@foodbridge.local').trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? '';
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? '';
  if (adminPassword.length < 10 || demoPassword.length < 10) {
    fail('Set SEED_ADMIN_PASSWORD and SEED_DEMO_PASSWORD (at least 10 characters each) in your local .env first.');
  }
  const demoStatus: AccountStatus = process.env.SEED_DEMO_APPROVED === 'true' ? 'APPROVED' : 'PENDING';
  const [adminHash, demoHash] = await Promise.all([bcrypt.hash(adminPassword, 12), bcrypt.hash(demoPassword, 12)]);

  console.log('\nFoodBridge demo seed\n\nAccounts:');
  await ensureUser(adminEmail, { name: 'FoodBridge Admin', role: 'ADMIN', accountStatus: 'APPROVED' }, adminHash);

  const donorUserId = await ensureUser(
    'donor@foodbridge.local',
    { name: 'Asha Mehta (Demo Donor)', role: 'DONOR', accountStatus: demoStatus, phone: '+91 90000 00001' },
    demoHash,
    (userId) => prisma.donorProfile.create({
      data: {
        userId, organisationName: 'Rajasthani Rasoi (Demo)', organisationType: 'restaurant',
        address: JAIPUR.mansarovar.address, latitude: JAIPUR.mansarovar.lat, longitude: JAIPUR.mansarovar.lng,
        description: 'Demo restaurant donating surplus thalis after lunch and dinner service.',
      },
    })
  );
  await ensureUser(
    'ngo@foodbridge.local',
    { name: 'Ravi Sharma (Demo NGO)', role: 'NGO', accountStatus: demoStatus, phone: '+91 90000 00002' },
    demoHash,
    (userId) => prisma.nGOProfile.create({
      data: {
        userId, organisationName: 'Annapurna Foundation (Demo)', registrationNumber: 'DEMO-NGO-001',
        address: JAIPUR.malviyaNagar.address, latitude: JAIPUR.malviyaNagar.lat, longitude: JAIPUR.malviyaNagar.lng,
        receivingCapacity: 150, foodPreferences: 'COOKED_MEALS,BAKERY,RAW_VEGETABLES',
        description: 'Demo NGO running a community kitchen and night shelter.',
      },
    })
  );
  await ensureUser(
    'volunteer@foodbridge.local',
    { name: 'Priya Singh (Demo Volunteer)', role: 'VOLUNTEER', accountStatus: demoStatus, phone: '+91 90000 00003' },
    demoHash,
    (userId) => prisma.volunteerProfile.create({
      data: {
        userId, address: JAIPUR.cScheme.address, latitude: JAIPUR.cScheme.lat, longitude: JAIPUR.cScheme.lng,
        vehicleType: 'bike', availability: 'Evenings and weekends', maxDistance: 15,
      },
    })
  );

  const donor = await prisma.donorProfile.findUnique({ where: { userId: donorUserId } });
  if (!donor) {
    console.log('\nDonations: skipped (demo donor has no profile)');
    return;
  }

  const now = Date.now();
  const donations: (Omit<Prisma.FoodDonationUncheckedCreateInput, 'donorProfileId' | 'remainingQuantity' | 'preparationTime' | 'safePickupDeadline'> & { id: string; hoursLeft: number })[] = [
    {
      id: 'demo-donation-1', foodName: 'Veg thali surplus (dal, rice, sabzi, roti)', hoursLeft: 6,
      description: '[Demo] Freshly cooked lunch surplus, packed in sealed containers.',
      foodCategory: 'COOKED_MEALS', foodType: 'VEGETARIAN', quantity: 60, unit: 'MEALS',
      storageConditions: 'Hot-held, sealed containers', handlingInstructions: 'Keep upright; deliver within 3 hours of pickup.',
      pickupAddress: JAIPUR.mansarovar.address, latitude: JAIPUR.mansarovar.lat, longitude: JAIPUR.mansarovar.lng,
      foodSafetyDeclared: true, contactPhone: '+91 90000 00001',
    },
    {
      id: 'demo-donation-2', foodName: 'Assorted bread and buns', hoursLeft: 20,
      description: '[Demo] Day-end bakery stock, baked this morning.',
      foodCategory: 'BAKERY', foodType: 'VEGETARIAN', quantity: 12, unit: 'KG',
      storageConditions: 'Room temperature, dry', handlingInstructions: 'Crates are stackable.',
      pickupAddress: JAIPUR.vaishaliNagar.address, latitude: JAIPUR.vaishaliNagar.lat, longitude: JAIPUR.vaishaliNagar.lng,
      foodSafetyDeclared: true, contactPhone: '+91 90000 00001',
    },
    {
      id: 'demo-donation-3', foodName: 'Fresh seasonal vegetables', hoursLeft: 36,
      description: '[Demo] Surplus produce from the kitchen store – tomatoes, onions, potatoes.',
      foodCategory: 'RAW_VEGETABLES', foodType: 'VEGAN', quantity: 25, unit: 'KG',
      storageConditions: 'Cool and dry', pickupAddress: JAIPUR.mansarovar.address,
      latitude: JAIPUR.mansarovar.lat, longitude: JAIPUR.mansarovar.lng, foodSafetyDeclared: true,
    },
  ];

  console.log('\nDonations:');
  for (const { hoursLeft, ...d } of donations) {
    const timing = { preparationTime: new Date(now - HOUR), safePickupDeadline: new Date(now + hoursLeft * HOUR) };
    const existing = await prisma.foodDonation.findUnique({
      where: { id: d.id },
      select: { donorProfileId: true, description: true, status: true, _count: { select: { requests: true } } },
    });
    if (!existing) {
      await prisma.foodDonation.create({ data: { ...d, ...timing, donorProfileId: donor.id, remainingQuantity: d.quantity } });
      console.log(`  • ${d.id} created`);
    } else if (
      existing.donorProfileId === donor.id && existing.description?.startsWith('[Demo]') &&
      existing._count.requests === 0 && ['AVAILABLE', 'EXPIRED'].includes(existing.status)
    ) {
      await prisma.foodDonation.update({
        where: { id: d.id },
        data: { ...timing, status: 'AVAILABLE', remainingQuantity: d.quantity },
      });
      console.log(`  • ${d.id} refreshed (new pickup deadline)`);
    } else {
      console.log(`  • ${d.id} in use by the demo – left unchanged`);
    }
  }

  // Local-only credentials sheet for the presenter (gitignored: *.local.md). Never committed or printed.
  writeFileSync(
    'DEMO_CREDENTIALS.local.md',
    [
      '# FoodBridge demo credentials (LOCAL ONLY – do not commit or share)',
      '',
      'Generated by `npm run db:seed` from your local .env. Demo data only – never use in production.',
      '',
      '| Role | Email | Password |',
      '|---|---|---|',
      `| Admin | ${adminEmail} | ${adminPassword} |`,
      `| Donor | donor@foodbridge.local | ${demoPassword} |`,
      `| NGO | ngo@foodbridge.local | ${demoPassword} |`,
      `| Volunteer | volunteer@foodbridge.local | ${demoPassword} |`,
      '',
      `Donor, NGO and volunteer start ${demoStatus}${demoStatus === 'PENDING' ? ' – approve them as the admin first.' : '.'}`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  console.log(`\nDone. Demo logins are in DEMO_CREDENTIALS.local.md (gitignored); passwords are never printed.${demoStatus === 'PENDING' ? '\nDemo donor/NGO/volunteer are PENDING – approve them as the admin to start the demo.' : ''}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
