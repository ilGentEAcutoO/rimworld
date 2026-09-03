import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

// Storage is isolated per test FILE, not per test, so rows written by one test
// would otherwise leak into the next and break "nothing was written" assertions.
beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS, 'd1_migrations');
  await env.DB.prepare('DELETE FROM saves').run();
});
