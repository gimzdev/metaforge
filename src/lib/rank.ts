/** Ranks as people read them (colours, labels) and as one number for charts. Safe on server and client. */

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

function tierName(tier: string | null | undefined): string {
  const t = (tier ?? '').toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Unranked';
}

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export function rankLabel(tier?: string | null, division?: string | null): string {
  if (!tier) return 'Unranked';
  return APEX.has(tier.toUpperCase()) || !division ? tierName(tier) : `${tierName(tier)} ${division}`;
}

/** Ranked tiers below Master, lowest first: four divisions of 100 LP each. */
const LADDER = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'];
const DIVISION = { IV: 0, III: 1, II: 2, I: 3 } as Record<string, number>;
/** Where Master starts on the ladder score; Master, Grandmaster and Challenger share one LP scale above it. */
export const APEX_SCORE = LADDER.length * 400;

/** One number for a rank (Iron IV 0 LP = 0, +100 per division, Master 0 LP = 2800), so a season reads as one line. */
export function ladderScore(tier: string, division: string | null | undefined, lp: number): number | null {
  const t = tier.toUpperCase();
  if (APEX.has(t)) return APEX_SCORE + Math.max(0, lp);
  const i = LADDER.indexOf(t);
  if (i < 0) return null;
  return i * 400 + (DIVISION[(division ?? '').toUpperCase()] ?? 0) * 100 + Math.min(100, Math.max(0, lp));
}

/** The rank at a ladder score (the inverse of ladderScore); `apex` names scores at or above Master. */
export function fromScore(s: number, apex = 'MASTER'): { tier: string; division: string | null; lp: number } {
  if (s >= APEX_SCORE) return { tier: apex, division: 'I', lp: Math.round(s - APEX_SCORE) };
  const v = Math.max(0, s);
  return { tier: LADDER[Math.floor(v / 400)], division: ['IV', 'III', 'II', 'I'][Math.floor((v % 400) / 100)], lp: Math.round(v % 100) };
}

export const isApex = (tier: string) => APEX.has(tier.toUpperCase());
