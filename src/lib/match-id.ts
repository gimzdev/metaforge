import { normalizePlatform } from '@/lib/riot/regions';

/** "EUW1_7412345678" → "euw1" */
export function platformFromMatchId(matchId: string, fallback = 'na1'): string {
  return normalizePlatform(matchId.split('_')[0]) ?? fallback;
}
