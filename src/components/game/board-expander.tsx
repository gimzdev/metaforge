import type { ReactNode } from 'react';
import { BoardPreview } from '@/components/game/board-preview';
import { Panel } from '@/components/ui';

type Units = Array<{ id: string; star: number; items: string[]; freq: number }>;

/** The comp page's "Typical board" panel: the unit list with the recommended board beside it (below it on phones). */
export function TypicalBoardPanel({ units, children }: { units: Units; children: ReactNode }) {
  return (
    <Panel title="Typical board">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="shrink-0 lg:border-l lg:border-line lg:pl-8">
          <BoardPreview units={units} px={54} />
        </div>
      </div>
    </Panel>
  );
}
