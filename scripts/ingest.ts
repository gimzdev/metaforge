/**
 * Run one match-collection pass from the command line:
 *   npm run ingest                 (regions from INGEST_REGIONS)
 *   npm run ingest -- euw1 kr      (specific regions)
 */
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

async function main() {
  const { runIngest } = await import('../src/lib/ingest');
  const { parseRegionList } = await import('../src/lib/riot/regions');
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const regions = args.length ? parseRegionList(args.join(',')) : undefined;
  const report = await runIngest({ regions, log: (m) => console.log(`  ${m}`) });
  if (report.error) {
    console.error(`\n✖ ${report.error}`);
    process.exit(1);
  }
  const stored = report.regions.reduce((s, r) => s + r.stored, 0);
  console.log(`\n✔ Stored ${stored} new ranked matches in ${Math.round((report.finishedAt - report.startedAt) / 1000)}s (${report.store})`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
