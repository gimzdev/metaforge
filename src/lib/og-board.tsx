// Link pictures (1200 x 630) for a comp and for a shared builder board: the board drawn as players stand it, each
// champion in its cost's color, with what the link leads to beside it. next/og's own type; MetaForge's dark and gold.
import 'server-only';
import type { ReactNode } from 'react';
import { cdn } from './static';

export const OG_SIZE = { width: 1200, height: 630 };

const INK = { night: '#0f0d0b', canopy: '#161411', bark: '#25211d', moss: '#3a342d', moon: '#f1e9d8', lichen: '#b8ab94', fog: '#857a68', wisp: '#e2b86a' };
const COST = ['#e67fa9', '#a3a9af', '#4fb07c', '#4f93d8', '#b16ad6', '#deb04e'];
export const TIER: Record<string, string> = { S: '#e0704f', A: '#deaa4f', B: '#b3c064', C: '#6fa6c4', D: '#9a90c4' };

export interface OgUnit {
  hex: number;
  star: number;
  cost: number;
  name: string;
  /** the champion's portrait as a data URL, or null when it could not be fetched in time */
  icon: string | null;
}

/** A champion's portrait as a data URL, or null when CommunityDragon does not answer in time (drawn without it). */
export async function portrait(path: string | null | undefined): Promise<string | null> {
  const url = cdn(path);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/png';
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Cut a text at a word, with an ellipsis. */
export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/[\s,.;:&]+\S*$/, '')}…` : s);

/** The four rows of seven hexes, odd rows half a hex to the right, the front line at the top as in the builder. */
function Board({ units }: { units: OgUnit[] }) {
  const W = 68, H = 60, R = 29;
  const byHex = new Map(units.map((u) => [u.hex, u]));
  const cells: ReactNode[] = [];
  for (let hex = 0; hex < 28; hex++) {
    const row = Math.floor(hex / 7), col = hex % 7;
    const x = col * W + (row % 2 ? W / 2 : 0), y = row * H;
    const u = byHex.get(hex);
    cells.push(
      <div
        key={hex}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: R * 2,
          height: R * 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          background: u ? INK.bark : 'rgba(241,233,216,0.05)',
          border: u ? `4px solid ${COST[u.cost] ?? COST[0]}` : '2px solid rgba(241,233,216,0.08)',
          overflow: 'hidden',
          color: INK.moon,
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {u ? u.icon ? <img src={u.icon} width={R * 2} height={R * 2} alt="" style={{ objectFit: 'cover' }} /> : clip(u.name, 6) : null}
      </div>,
    );
    if (u && u.star > 1)
      cells.push(
        <div key={`s${hex}`} style={{ position: 'absolute', left: x + R - 6 * u.star, top: y - 8, display: 'flex', gap: 2 }}>
          {Array.from({ length: Math.min(u.star, 4) }, (_, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 999, background: INK.wisp, border: `2px solid ${INK.night}` }} />
          ))}
        </div>,
      );
  }
  return <div style={{ display: 'flex', position: 'relative', width: 7 * W + W / 2, height: 3 * H + R * 2 + 4 }}>{cells}</div>;
}

/** The picture: what it is and its numbers on the left, the board on the right, MetaForge's name along the bottom. */
export function BoardCard({ kicker, title, badge, lines, units }: { kicker: string; title: string; badge?: { text: string; color: string }; lines: string[]; units: OgUnit[] }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '56px 60px 44px', color: INK.moon, background: `radial-gradient(80% 70% at 85% 10%, rgba(226,184,106,0.16), transparent 60%), linear-gradient(180deg, ${INK.canopy}, ${INK.night})` }}>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 520, marginRight: 40 }}>
          <span style={{ fontSize: 26, color: INK.wisp }}>{kicker}</span>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
            {badge && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 78, height: 78, marginRight: 22, borderRadius: 16, background: badge.color, color: INK.night, fontSize: 50, fontWeight: 700 }}>{badge.text}</div>
            )}
            <span style={{ fontSize: title.length > 28 ? 48 : 58, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>{clip(title, 52)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, fontSize: 26, color: INK.lichen }}>
            {lines.map((l) => (
              <span key={l} style={{ marginTop: 6 }}>
                {l}
              </span>
            ))}
          </div>
        </div>
        <Board units={units} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 24, color: INK.fog }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: INK.moon }}>MetaForge</span>
        <span>metaforge.lol</span>
      </div>
    </div>
  );
}
