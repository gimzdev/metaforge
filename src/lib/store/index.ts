import { singleton } from '@/lib/cache';
import { env } from '@/lib/env';
import { FileStore } from './file';
import { PostgresStore } from './postgres';
import type { Store } from './types';

export function getStore(): Store {
  return singleton<Store>('store', () =>
    env.databaseUrl ? new PostgresStore(env.databaseUrl) : new FileStore(),
  );
}

export type { BoardRecord, MatchRecord, PlayerRecord, Store, StoreStats } from './types';
