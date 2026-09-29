/** Riot platform ↔ routing tables for TFT (verified against the current API schema). */

export type MatchRouting = 'americas' | 'europe' | 'asia' | 'sea';
export type AccountRouting = 'americas' | 'europe' | 'asia';

export interface Platform {
  id: string;
  label: string;
  name: string;
  match: MatchRouting;
  account: AccountRouting;
}

export const PLATFORMS: Platform[] = [
  { id: 'na1', label: 'NA', name: 'North America', match: 'americas', account: 'americas' },
  { id: 'euw1', label: 'EUW', name: 'Europe West', match: 'europe', account: 'europe' },
  { id: 'eun1', label: 'EUNE', name: 'Europe Nordic & East', match: 'europe', account: 'europe' },
  { id: 'kr', label: 'KR', name: 'Korea', match: 'asia', account: 'asia' },
  { id: 'jp1', label: 'JP', name: 'Japan', match: 'asia', account: 'asia' },
  { id: 'br1', label: 'BR', name: 'Brazil', match: 'americas', account: 'americas' },
  { id: 'la1', label: 'LAN', name: 'Latin America North', match: 'americas', account: 'americas' },
  { id: 'la2', label: 'LAS', name: 'Latin America South', match: 'americas', account: 'americas' },
  { id: 'oc1', label: 'OCE', name: 'Oceania', match: 'sea', account: 'americas' },
  { id: 'tr1', label: 'TR', name: 'Türkiye', match: 'europe', account: 'europe' },
  { id: 'ru', label: 'RU', name: 'Russia', match: 'europe', account: 'europe' },
  { id: 'me1', label: 'ME', name: 'Middle East', match: 'europe', account: 'europe' },
  { id: 'sg2', label: 'SEA', name: 'Southeast Asia', match: 'sea', account: 'asia' },
  { id: 'tw2', label: 'TW', name: 'Taiwan', match: 'sea', account: 'asia' },
  { id: 'vn2', label: 'VN', name: 'Vietnam', match: 'sea', account: 'asia' },
];

const byId = new Map(PLATFORMS.map((p) => [p.id, p]));
const aliases = new Map<string, string>();
for (const p of PLATFORMS) {
  aliases.set(p.id, p.id);
  aliases.set(p.label.toLowerCase(), p.id);
}
for (const [alias, id] of Object.entries({
  na: 'na1', euw: 'euw1', eune: 'eun1', eun: 'eun1', jp: 'jp1', br: 'br1', lan: 'la1', las: 'la2',
  oce: 'oc1', oc: 'oc1', tr: 'tr1', me: 'me1', sg: 'sg2', sea: 'sg2', ph2: 'sg2', th2: 'sg2', tw: 'tw2', vn: 'vn2',
})) {
  aliases.set(alias, id);
}

export function getPlatform(id: string | null | undefined): Platform | undefined {
  return id ? byId.get(id.toLowerCase()) : undefined;
}

export function normalizePlatform(input: string | null | undefined): string | null {
  if (!input) return null;
  return aliases.get(input.trim().toLowerCase()) ?? null;
}

export function platformLabel(id: string): string {
  return getPlatform(id)?.label ?? id.toUpperCase();
}

export function parseRegionList(raw: string): string[] {
  if (raw.trim().toLowerCase() === 'all') return PLATFORMS.map((p) => p.id);
  const ids = raw
    .split(/[\s,]+/)
    .map((r) => normalizePlatform(r))
    .filter((r): r is string => Boolean(r));
  return [...new Set(ids)];
}
