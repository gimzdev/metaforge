/**
 * Real final fights, to check Patchlab's simulator against: in every ranked match the 1st place board beat the 2nd place
 * board in the last round. `npm run fights` (or `npx tsx scripts/fights.ts [days]`) writes them to .data/fights-set<N>.json,
 * newest first, from the current patch on (or the last `days` days). No player is in the file: boards, levels and augments.
 * It also saves the set's champion and trait records from CommunityDragon (.data/cdragon-set<N>.json): every form of the
 * Adaptor champions is in there, which the patch notes and tier sites leave out.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const MAX_FIGHTS = 40_000;

async function main() {
  const { getStore } = await import('../src/lib/store');
  const { configuredSetNumber, currentPatch, RANKED_QUEUE } = await import('../src/config/game');
  const set = configuredSetNumber();
  const days = Number(process.argv[2]);
  const patch = currentPatch(set);
  const since = days > 0 ? Date.now() - days * 86_400_000 : (patch?.start ?? Date.now() - 7 * 86_400_000);
  const store = getStore();
  console.log(`  Reading ranked Set ${set} matches since ${new Date(since).toISOString().slice(0, 10)} from ${store.describe()}…`);
  type Board = { level: number; lastRound: number; units: Array<[string, number, string[]]>; augments: string[] };
  // A board in one line: level, last round, its units as "unit*star*item,item" and its augments
  const pack = (b: Board) => [b.level, b.lastRound, b.units.map(([u, star, items]) => `${u}*${star}*${items.join(',')}`).join(' '), b.augments.join(',')];
  const fights: unknown[] = [];
  await store.readMatches({ setNumber: set, queueId: RANKED_QUEUE, since, limit: MAX_FIGHTS * 8, after: null }, (m) => {
    if (fights.length >= MAX_FIGHTS) return;
    const first = m.boards.find((b) => b.placement === 1), second = m.boards.find((b) => b.placement === 2);
    if (first && second) fights.push([m.datetime, pack(first), pack(second)]);
  });
  mkdirSync('.data', { recursive: true });
  const file = `.data/fights-set${set}.json`;
  writeFileSync(file, JSON.stringify({ set, patch: patch?.label ?? null, made: Date.now(), format: 'won and lost boards: [level, last round, "unit*star*items ...", "augments"]', fights }));
  console.log(`\n✔ ${fights.length} final fights in ${file}`);
  await gameData(set).catch((error) => console.log(`  (no game data: ${error instanceof Error ? error.message : error})`));
  process.exit(0);
}

/** The set's champion and trait records from CommunityDragon, every form included */
async function gameData(set: number) {
  const url = 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json';
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`CommunityDragon answered ${res.status}`);
  type Rec = { apiName?: string };
  type SetData = { number?: number; champions?: Rec[]; traits?: Rec[] };
  const raw = (await res.json()) as { setData?: SetData[]; sets?: Record<string, SetData> };
  const lists = [raw.sets?.[String(set)], ...(raw.setData ?? []).filter((s) => s.number === set)];
  const own = (r: Rec) => new RegExp(`^(da_|tft${set}_)`, 'i').test(r?.apiName ?? '');
  const pick = (k: 'champions' | 'traits') => [...new Map(lists.flatMap((s) => s?.[k] ?? []).filter(own).map((r) => [r.apiName, r])).values()];
  const out = { from: url, made: Date.now(), champions: pick('champions'), traits: pick('traits') };
  writeFileSync(`.data/cdragon-set${set}.json`, JSON.stringify(out));
  console.log(`✔ ${out.champions.length} champions, ${out.traits.length} traits in .data/cdragon-set${set}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
