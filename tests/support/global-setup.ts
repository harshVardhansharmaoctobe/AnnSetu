import { prepareTestDatabase } from './test-db';
import { startServer } from './server';

// Vitest global setup for integration tests: fresh test DB + production server on :3100.
export default async function setup() {
  await prepareTestDatabase();
  // Integration runs use database image storage (the Vercel mode); the E2E server uses local disk.
  const server = await startServer(3100, { UPLOAD_STORAGE: 'database' });
  return async () => {
    await server.stop();
  };
}
