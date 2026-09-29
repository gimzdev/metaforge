export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startIngestScheduler } = await import('./lib/ingest/scheduler');
  startIngestScheduler();
}
