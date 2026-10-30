import { prepareTestDatabase } from './test-db';
import { startServer } from './server';

// Vitest global setup for integration tests: fresh test DB + production server on :3100.
export default async function setup() {
  await prepareTestDatabase();
  const server = await startServer(3100);
  return async () => {
    await server.stop();
  };
}
