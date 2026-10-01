import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { FileStore } from './file';
import { PostgresStore } from './postgres';
import type { Store } from './types';

/** Postgres when DATABASE_URL is set, otherwise local files. */
export function getStore(): Store {
  return singleton<Store>('store', () => (env.databaseUrl ? new PostgresStore(env.databaseUrl) : new FileStore()));
}

export type * from './types';
