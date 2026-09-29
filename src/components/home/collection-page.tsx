import { Collection, type CollectionTab, type StatMap } from '@/components/home/collection';
import { EntityTable } from '@/components/stats/entity-table';
import { ScopeBar } from '@/components/stats/scope-bar';
import { PageHeader, Panel } from '@/components/ui/primitives';
import { getMeta } from '@/lib/stats/service';
import type { Scope, StatRow } from '@/lib/stats/types';

function toMap(rows: StatRow[], minN: number): StatMap {
  const out: StatMap = {};
  for (const r of rows) if (r.n >= minN) out[r.id] = [Number(r.avg.toFixed(2)), Number(r.freq.toFixed(4))];
  return out;
}

/** Shared body of the /units, /items and /traits index pages. */
export async function CollectionPage({
  tab,
  title,
  description,
  scope,
}: {
  tab: CollectionTab;
  title: string;
  description: string;
  scope: Partial<Scope>;
}) {
  const data = await getMeta(scope).catch(() => null);
  const has = Boolean(data && data.meta.total > 0);
  const itemMin = data ? Math.max(5, Math.round(data.minN * 0.6)) : 5;
  const stats = has && data ? { units: toMap(data.units, data.minN), items: toMap(data.items, itemMin) } : null;
  return (
    <div className="space-y-10">
      <PageHeader title={title} description={description}>
        {has && data && <ScopeBar scope={data.scope} meta={data.meta} />}
      </PageHeader>
      {has && data && tab !== 'augments' && (
        <Panel title="Performance" aside={<span className="text-xs">{data.scope.patch === 'all' ? 'Whole set' : `Patch ${data.scope.patch}`}</span>} flush>
          {tab === 'champions' && <EntityTable kind="unit" rows={data.units} minN={data.minN} limit={20} />}
          {tab === 'items' && <EntityTable kind="item" rows={data.items} minN={itemMin} limit={20} />}
          {tab === 'traits' && <EntityTable kind="trait" rows={data.traits} minN={data.minN} limit={20} />}
        </Panel>
      )}
      <Collection stats={stats} initialTab={tab} title="Browse" />
    </div>
  );
}
