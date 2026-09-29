/** Ranked tier display helpers. */

const TIER_COLOR: Record<string, string> = {
  IRON: '#8d807a',
  BRONZE: '#c08a5f',
  SILVER: '#b7c4ce',
  GOLD: '#e9bd5b',
  PLATINUM: '#4fc9b8',
  EMERALD: '#38c983',
  DIAMOND: '#7d98ff',
  MASTER: '#c07bff',
  GRANDMASTER: '#ff6b78',
  CHALLENGER: '#f9d977',
  // Hyper Roll rated tiers
  GRAY: '#a3adb5',
  GREEN: '#5fd08b',
  BLUE: '#5aa9ff',
  PURPLE: '#b98bff',
  HYPER: '#ff9a4d',
  ORANGE: '#ff9a4d',
};

export function tierColor(tier: string | null | undefined): string {
  return TIER_COLOR[(tier ?? '').toUpperCase()] ?? '#9cb4a8';
}

export function tierName(tier: string | null | undefined): string {
  const t = (tier ?? '').toLowerCase();
  if (!t) return 'Unranked';
  if (t === 'grandmaster') return 'Grandmaster';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export function rankLabel(tier?: string | null, division?: string | null): string {
  if (!tier) return 'Unranked';
  return APEX.has(tier.toUpperCase()) || !division ? tierName(tier) : `${tierName(tier)} ${division}`;
}

const QUEUE_TYPES: Record<string, string> = {
  RANKED_TFT: 'Ranked',
  RANKED_TFT_DOUBLE_UP: 'Double Up',
  RANKED_TFT_TURBO: 'Hyper Roll',
  RANKED_TFT_PAIRS: 'Double Up',
};

export function queueTypeLabel(queueType: string): string {
  const known = QUEUE_TYPES[queueType];
  if (known) return known;
  const rest = queueType.replace(/^RANKED_TFT_?/, '').replace(/_/g, ' ').toLowerCase();
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : 'Ranked';
}

export function profileIconUrl(id: number | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;
}
