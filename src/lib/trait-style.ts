import type { Trait, TraitStyle } from '@/types/static';

const MATCH_STYLE: Record<number, TraitStyle> = { 0: 'inactive', 1: 'bronze', 2: 'silver', 3: 'gold', 4: 'prismatic' };

/** Visual style of a trait at a breakpoint (1-based tier) or from a match's style number. */
export function styleFor(trait: Trait, tier?: number, matchStyle?: number): TraitStyle {
  if (trait.kind === 'unique' && (tier ?? 0) > 0) return 'unique';
  if (matchStyle !== undefined) return MATCH_STYLE[matchStyle] ?? 'bronze';
  if (!tier) return 'inactive';
  return trait.effects[Math.min(tier, trait.effects.length) - 1]?.style ?? 'bronze';
}
