import { cachedAsync } from '@/lib/cache';

// Little Legends (Riot calls them companions): a match lists each player's companion by content id; names and pictures come
// from CommunityDragon's loadout data, read once a day. If it can't be reached the legend is simply left out.
const BASE = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/';

export interface Legend {
  name: string;
  icon: string;
}

interface RawCompanion {
  contentId?: string;
  name?: string;
  speciesName?: string;
  loadoutsIcon?: string;
}

const iconUrl = (path: string) => BASE + path.replace(/^\/lol-game-data\/assets\//i, '').toLowerCase();

async function loadLegends(): Promise<Map<string, Legend>> {
  const res = await fetch(`${BASE}v1/companions.json`, { signal: AbortSignal.timeout(8000), next: { revalidate: 86_400 } });
  if (!res.ok) throw new Error(`companions ${res.status}`);
  const list = (await res.json()) as RawCompanion[];
  const out = new Map<string, Legend>();
  for (const c of Array.isArray(list) ? list : []) {
    if (!c.contentId || !c.loadoutsIcon) continue;
    out.set(c.contentId.toLowerCase(), { name: c.speciesName || c.name || 'Little Legend', icon: iconUrl(c.loadoutsIcon) });
  }
  return out;
}

/** content id → legend; empty (and retried in a minute) when CommunityDragon is unreachable. */
export async function legendsById(): Promise<Map<string, Legend>> {
  try {
    return await cachedAsync('legends', 24 * 3600_000, loadLegends);
  } catch {
    return cachedAsync('legends-miss', 60_000, async () => new Map<string, Legend>());
  }
}
