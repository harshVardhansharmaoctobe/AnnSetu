import { mkdirSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prepareTestDatabase, testPrisma } from '../support/test-db';
import { startServer } from '../support/server';

export const FIXTURE_FILE = 'test-results/e2e-fixture.json';

// Fresh test DB, one admin provisioned directly (as in production), server on :3200.
export default async function globalSetup() {
  await prepareTestDatabase();
  const prisma = testPrisma();
  const adminPassword = randomBytes(12).toString('base64url');
  const admin = await prisma.user.create({
    data: {
      email: 'e2e.admin@fbtest.invalid', name: 'E2E Admin', role: 'ADMIN', accountStatus: 'APPROVED',
      password: await bcrypt.hash(adminPassword, 10),
    },
  });
  await prisma.$disconnect();

  mkdirSync('test-results', { recursive: true });
  writeFileSync(FIXTURE_FILE, JSON.stringify({ adminEmail: admin.email, adminPassword }));

  const server = await startServer(3200);
  return async () => {
    await server.stop();
  };
}
