import type { ReactNode } from 'react';
import { ItemIcon, StarShapes } from '@/components/game/entities';
import { GameImage } from '@/components/game/game-image';
import { COLS, ROWS } from '@/lib/builder';
import { compBoard } from '@/lib/placement';
import { costColor, currentIndex } from '@/lib/static';
import { cn } from '@/lib/utils';

type CompUnit = { id: string; star: number; items: string[]; freq: number; trait?: string };

const HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
const TALL = 2 / Math.sqrt(3);

/**
 * The board as TFT draws it: 4 rows of 7 pointy hexes that tile with no gaps, odd rows shifted half a hex right, front line
 * on top. `px` is the width of one hex.
 */
export function BoardPreview({ units, px = 48, className }: { units: CompUnit[]; px?: number; className?: string }) {
  // Every unit of the comp's typical board (the same ones the unit list shows).
  const board = compBoard(units, currentIndex());
  const index = currentIndex();
  const h = px * TALL;
  const step = h * 0.75;
  const itemPx = Math.max(11, Math.round(px * 0.26));
  const starPx = Math.round(px * 0.22);
  // Room above for the stars and below for the items, which both hang outside the hexes.
  const padTop = Math.ceil(starPx * 0.7);
  const padBottom = Math.ceil(itemPx * 0.4);
  const overlays: ReactNode[] = [];
  const cells = Array.from({ length: ROWS * COLS }, (_, hex) => {
    const row = Math.floor(hex / COLS);
    const col = hex % COLS;
    const left = col * px + (row % 2 ? px / 2 : 0);
    const top = row * step;
    const unit = board[hex];
    const champion = unit ? index.champion(unit.key) : undefined;
    if (!unit || !champion) {
      return <span key={hex} className="absolute bg-white/[0.045]" style={{ left: left + 2.5, top: top + 2.5, width: px - 5, height: h - 5, clipPath: HEX }} />;
    }
    const color = costColor(champion.cost);
    // Stars and items go in a layer above every hex, so a unit in the next row never covers them.
    if (unit.star >= 2) {
      overlays.push(
        <StarShapes key={`s${hex}`} star={unit.star} className="absolute" style={{ left, top: top - starPx * 0.45, width: px, ['--s' as string]: `${starPx}px` }} />,
      );
    }
    if (unit.items.length > 0) {
      overlays.push(
        <span key={`i${hex}`} className="absolute flex justify-center gap-px" style={{ left, top: top + h - itemPx * 1.15, width: px }}>
          {unit.items.slice(0, 3).map((it, i) => (
            <ItemIcon key={`${it}-${i}`} id={it} px={itemPx} link={false} hover={false} />
          ))}
        </span>,
      );
    }
    return (
      <div key={hex} className="absolute" style={{ left, top, width: px, height: h }} data-hover={`u:${champion.key}`}>
        <span className="absolute" style={{ inset: 2.5, clipPath: HEX, background: `linear-gradient(160deg, ${color}, color-mix(in oklab, ${color} 45%, #0f0d09))` }} />
        <span className="absolute" style={{ inset: 5, clipPath: HEX }}>
          <GameImage src={champion.icon} alt={champion.name} px={px} className="h-full w-full" imgClassName="scale-[1.12]" />
        </span>
      </div>
    );
  });
  return (
    <div className={cn('max-w-full overflow-x-auto', className)} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
      <div className="relative" style={{ width: px * COLS + px / 2, height: step * (ROWS - 1) + h }} role="img" aria-label="Recommended board positions">
        {cells}
        <div className="pointer-events-none absolute inset-0 z-10">{overlays}</div>
      </div>
    </div>
  );
}
