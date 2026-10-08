import type { NextRequest } from 'next/server';
import { failure, json, limited } from '@/lib/http';
import { getAccountByRiotId } from '@/lib/riot/api';
import { getPlatform, normalizePlatform } from '@/lib/riot/regions';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** Players already seen by MetaForge whose game name starts with `q` (Riot has no search by name alone). */
export async function GET(req: NextRequest) {
  const blocked = limited(req, 'psearch', 120);
  if (blocked) return blocked;
  const probe = req.nextUrl.searchParams.get('probe') === '1';
  const slow = probe && limited(req, 'pprobe', 15, 'Too many name lookups. Try again in a minute.');
  if (slow) return slow;
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const region = getPlatform(normalizePlatform(req.nextUrl.searchParams.get('platform')));
  const headers = { 'Cache-Control': 'no-store' };
  // A Riot ID's name is 3 to 16 characters: longer input matches nobody (and is never cut down and sent to Riot).
  if (q.length < 2 || q.length > 16 || q.includes('#')) return json(req, { players: [] }, { headers });
  try {
    const store = getStore();
    // Every server's players; the selected region only ranks its own first (after exact matches) and picks the tags below.
    const rows = await store.searchPlayers(q, { prefer: region?.id, limit: 10 });
    const players = rows
      .filter((p) => p.gameName && p.tagLine && p.platform)
      .map((p) => ({ gameName: p.gameName, tagLine: p.tagLine, platform: p.platform, tier: p.tier ?? null, lp: p.lp ?? null }));
    // On submit (probe=1) also ask Riot for this exact name with the region's default tags (NA1, EUW, KR1...).
    if (probe && region && q.length >= 3) {
      const have = new Set(players.map((p) => `${p.gameName}#${p.tagLine}`.toLowerCase()));
      const tags = [...new Set([region.id.toUpperCase(), region.label.toUpperCase(), `${region.label.toUpperCase()}1`])];
      const deadline = Date.now() + 8_000;
      const found = await Promise.all(tags.map((tag) => getAccountByRiotId(q, tag, { deadline }).catch(() => null)));
      const accounts = found.filter((a): a is NonNullable<typeof a> => Boolean(a?.gameName && a.tagLine));
      // The tag only suggests a region: a server already stored for the player is kept.
      const known = await store.getPlayers(accounts.map((a) => a.puuid)).catch(() => null);
      const fresh = [];
      for (const a of accounts) {
        const key = `${a.gameName}#${a.tagLine}`.toLowerCase();
        if (have.has(key)) continue;
        have.add(key);
        const stored = known?.get(a.puuid);
        fresh.push({ puuid: a.puuid, gameName: a.gameName!, tagLine: a.tagLine!, platform: stored?.platform || region.id, stored });
      }
      if (fresh.length) {
        const rows = fresh.map((f) => ({ puuid: f.puuid, gameName: f.gameName, tagLine: f.tagLine, platform: f.stored?.platform ? null : f.platform }));
        void store.upsertPlayers(rows).catch(() => undefined);
        players.unshift(...fresh.map((f) => ({ gameName: f.gameName, tagLine: f.tagLine, platform: f.platform, tier: f.stored?.tier ?? null, lp: f.stored?.lp ?? null })));
      }
    }
    return json(req, { players }, { headers });
  } catch (error) {
    return failure(error, 'Failed to search players');
  }
}
