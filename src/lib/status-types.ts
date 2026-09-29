/** /api/status payload, shared by the server route and the header indicator. */
export interface StatusPayload {
  setNumber: number;
  boards: number;
  matches: number;
  lastMatchAt: number | null;
  collecting: boolean;
  schedulerActive: boolean;
  nextRunAt: number | null;
  riotKey: boolean;
  keyRejectedAt: number | null;
  database: boolean;
  store: string;
  lastReport: {
    ok: boolean;
    finishedAt: number;
    error?: string;
    stored: number;
    regions: Array<{ platform: string; stored: number; skipped: number; errors: number; note?: string }>;
  } | null;
  staticData: { source: string | null; loadedAt: number | null; error: string | null };
}
