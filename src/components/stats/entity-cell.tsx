'use client';

import { useStatic } from '@/components/providers';
import { AugmentIcon, ChampionIcon, ItemIcon, TraitBadge } from '@/components/game/entities';
import { costColor } from '@/lib/static-index';
import { ITEM_CATEGORY_LABEL } from '@/types/static';

export type EntityKind = 'unit' | 'item' | 'trait' | 'aug' | 'level';

/** Icon + name + subtitle for a stats row. */
export function EntityCell({ kind, id, tier }: { kind: EntityKind; id: string; tier?: number }) {
  const index = useStatic();
  if (kind === 'unit') {
    const c = index.champion(id);
    if (!c) return <span className="text-fog">{id}</span>;
    return (
      <span className="flex items-center gap-3">
        <ChampionIcon id={id} size="sm" link={false} />
        <span className="min-w-0 max-w-[9.5rem] @md:max-w-[15rem] @3xl:max-w-none">
          <span className="block truncate font-medium text-moon">{c.name}</span>
          <span className="block text-xs" style={{ color: costColor(c.cost) }}>
            {c.cost}-cost
          </span>
        </span>
      </span>
    );
  }
  if (kind === 'item') {
    const i = index.item(id);
    if (!i) return <span className="text-fog">{id}</span>;
    return (
      <span className="flex items-center gap-3">
        <ItemIcon id={id} size="sm" link={false} />
        <span className="min-w-0 max-w-[9.5rem] @md:max-w-[15rem] @3xl:max-w-none">
          <span className="block truncate font-medium text-moon">{i.name}</span>
          <span className="block text-xs text-fog">{ITEM_CATEGORY_LABEL[i.category]}</span>
        </span>
      </span>
    );
  }
  if (kind === 'trait') {
    const t = index.trait(id);
    if (!t) return <span className="text-fog">{id}</span>;
    const units = tier ? t.effects[tier - 1]?.minUnits : undefined;
    return (
      <span className="flex items-center gap-3">
        <TraitBadge id={id} tier={tier ?? 1} size={30} link={false} showCount={false} />
        <span className="min-w-0 max-w-[9.5rem] @md:max-w-[15rem] @3xl:max-w-none">
          <span className="block truncate font-medium text-moon">
            {units !== undefined && <span className="num mr-1.5 text-lichen">{units}</span>}
            {t.name}
          </span>
          <span className="block text-xs capitalize text-fog">{t.kind === 'trait' ? 'synergy' : t.kind}</span>
        </span>
      </span>
    );
  }
  if (kind === 'aug') {
    const a = index.augment(id);
    return (
      <span className="flex items-center gap-3">
        <AugmentIcon id={id} px={30} />
        <span className="min-w-0 max-w-[9.5rem] @md:max-w-[15rem] @3xl:max-w-none">
          <span className="block truncate font-medium text-moon">{a?.name ?? id}</span>
          <span className="block text-xs capitalize text-fog">{a?.tier ?? 'augment'}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-[30px] place-items-center rounded-md bg-bark text-sm font-semibold">{id}</span>
      <span className="font-medium text-moon">Level {id}</span>
    </span>
  );
}
