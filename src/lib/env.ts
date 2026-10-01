/** Typed access to environment configuration, with older variable names as fallbacks. */

function str(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() && !/^(changeme|your[-_ ].*|<.*>)$/i.test(value.trim())) {
      return value.trim();
    }
  }
  return '';
}

function int(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

export const env = {
  get riotApiKey() {
    return str('RIOT_API_KEY');
  },
  get databaseUrl() {
    return str('DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL');
  },
  /** Max Postgres connections per server instance. */
  get databasePoolMax() {
    return int('DATABASE_POOL_MAX', process.env.VERCEL ? 2 : 6, 1, 50);
  },
  get appUrl() {
    return (str('APP_URL', 'NEXT_PUBLIC_BASE_URL', 'NEXT_PUBLIC_APP_URL') || 'http://localhost:3000').replace(
      /\/+$/,
      '',
    );
  },
  get cronSecret() {
    return str('CRON_SECRET');
  },
  get sessionSecret() {
    return str('SESSION_SECRET', 'CRON_SECRET');
  },
  get rsoClientId() {
    return str('RIOT_CLIENT_ID', 'NEXT_PUBLIC_RIOT_CLIENT_ID');
  },
  get rsoClientSecret() {
    return str('RIOT_CLIENT_SECRET');
  },
  get rsoRedirectUri() {
    return str('RIOT_REDIRECT_URI') || `${this.appUrl}/auth/callback`;
  },
  get rsoEnabled() {
    return Boolean(this.rsoClientId && this.rsoClientSecret && this.sessionSecret);
  },
  get ingestRegions() {
    return str('INGEST_REGIONS') || 'na1,euw1,kr,eun1';
  },
  get ingestIntervalMinutes() {
    return int('INGEST_INTERVAL_MINUTES', 20, 0, 24 * 60);
  },
  get ingestPlayersPerRegion() {
    return int('INGEST_PLAYERS_PER_REGION', 10, 1, 300);
  },
  get ingestMatchesPerRegion() {
    return int('INGEST_MATCHES_PER_REGION', 40, 1, 5000);
  },
  /** Stored matches older than this many days are deleted after each collection run (0 keeps everything). */
  get retainDays() {
    return int('RETAIN_DAYS', 30, 0, 3650);
  },
  get ingestBudgetSeconds() {
    return int('INGEST_BUDGET_SECONDS', process.env.VERCEL ? 270 : 900, 10, 3600);
  },
  /**
   * Where Riot API calls go. "{host}" is replaced with the routing value (na1,
   * americas, ...). Point it at a caching proxy if you run one.
   */
  get riotApiBase() {
    return (str('RIOT_API_BASE_URL') || 'https://{host}.api.riotgames.com').replace(/\/+$/, '');
  },
  get riotRateLimits(): Array<[number, number]> {
    const raw = str('RIOT_RATE_LIMITS') || '20:1,100:120';
    const pairs = raw
      .split(',')
      .map((p) => p.split(':').map(Number))
      .filter(([n, s]) => Number.isFinite(n) && Number.isFinite(s) && n > 0 && s > 0)
      .map(([n, s]) => [n, s * 1000] as [number, number]);
    return pairs.length ? pairs : [[20, 1000], [100, 120_000]];
  },
  get dataDir() {
    return str('DATA_DIR') || (process.env.VERCEL ? '/tmp/metaforge' : '.data');
  },
  get staticDataUrl() {
    return str('STATIC_DATA_URL') || 'https://raw.communitydragon.org/latest/cdragon/tft/en_us.json';
  },
  /** Load static game data from a local CDragon-format JSON file instead of the network. */
  get staticDataFile() {
    return str('STATIC_DATA_FILE');
  },
  get maxBoards() {
    return int('MAX_BOARDS', 250_000, 1_000, 2_000_000);
  },
  get onVercel() {
    return Boolean(process.env.VERCEL);
  },
};
