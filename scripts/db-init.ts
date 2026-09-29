/** Create the database tables (safe to run repeatedly): npm run db:init */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { getStore } = await import('../src/lib/store');
  const { configuredSetNumber } = await import('../src/config/game');
  const store = getStore();
  await store.init();
  const stats = await store.stats(configuredSetNumber());
  console.log(`✔ ${store.describe()} ready: ${stats.matches} matches, ${stats.boards} boards stored for Set ${configuredSetNumber()}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(`✖ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
