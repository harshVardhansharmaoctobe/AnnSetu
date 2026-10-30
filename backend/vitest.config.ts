import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    pool: "forks",
    fileParallelism: false, // all files share one local chain
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
