import { spawn, type ChildProcess } from 'child_process';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { testDatabaseUrl } from './test-db';

export const TEST_UPLOAD_DIR = '.test-uploads';

/**
 * Starts the production build (`next start`) against the test database.
 * Explicit env vars take precedence over .env, so the dev DATABASE_URL is never used.
 */
export async function startServer(port: number, extraEnv: Record<string, string> = {}) {
  if (!existsSync(path.join(process.cwd(), '.next', 'BUILD_ID'))) {
    throw new Error('No production build found – run `npm run build` before the integration/E2E tests.');
  }
  rmSync(path.join(process.cwd(), TEST_UPLOAD_DIR), { recursive: true, force: true });

  const child: ChildProcess = spawn(
    process.execPath,
    [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: testDatabaseUrl(),
        NEXTAUTH_URL: `http://127.0.0.1:${port}`,
        UPLOAD_DIR: TEST_UPLOAD_DIR,
        REGISTER_RATE_LIMIT: '1000',
        UPLOAD_RATE_LIMIT: '1000',
        LOGIN_MAX_FAILURES: '5',
        NEXT_TELEMETRY_DISABLED: '1',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  child.stdout?.on('data', (d) => (output += d));
  child.stderr?.on('data', (d) => (output += d));

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited early:\n${output}`);
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return { base, stop: () => stopServer(child), logs: () => output };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`Test server did not become healthy in 60s:\n${output}`);
}

function stopServer(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(resolve, 5000);
  });
}
