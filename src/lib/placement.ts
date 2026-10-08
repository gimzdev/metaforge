import { norm, POSITION_SPECS, type PositionSpec, type Role } from '@/config/positioning';
import { COLS, MAX_ITEMS, ROWS, type BuilderBoard, type BuilderUnit } from '@/lib/builder';
import type { StaticIndex } from '@/lib/static';

// Recommended positions for a comp. TFT boards are 4 rows of 7 hexes; row 0 is the front line (closest to the enemy), row 3
// the back line, and odd rows sit half a hex to the right. The game data has range and durability for every champion, and
// config/positioning.ts adds what players know about the exceptions: corner carries, assassins that need a flank and a
// bodyguard, a tank that stands alone in front.

const at = (row: number, col: number) => row * COLS + col;
const rowOf = (hex: number) => Math.floor(hex / COLS);
const colOf = (hex: number) => hex % COLS;

/** The hexes touching this one (the board's odd rows are shifted right by half a hex). */
function neighbours(hex: number): number[] {
  const r = rowOf(hex);
  const c = colOf(hex);
  const shift = r % 2 ? [0, 1] : [-1, 0];
  const out: number[] = [];
  if (c > 0) out.push(at(r, c - 1));
  if (c < COLS - 1) out.push(at(r, c + 1));
  for (const nr of [r - 1, r + 1]) {
    if (nr < 0 || nr >= ROWS) continue;
    for (const d of shift) {
      const nc = c + d;
      if (nc >= 0 && nc < COLS) out.push(at(nr, nc));
    }
  }
  return out;
}

interface P {
  unit: BuilderUnit;
  name: string;
  key: string;
  cost: number;
  row: number;
  spec: PositionSpec;
  role: Role;
  power: number;
}

function describe(units: BuilderUnit[], index: StaticIndex): P[] {
  return units.flatMap((u) => {
    const c = index.champion(u.key);
    if (!c) return [];
    const name = norm((c as { baseName?: string }).baseName || c.name);
    const spec = POSITION_SPECS[name] ?? {};
    // Without an entry, the champion's role comes from its range and durability (row: 0 tank … 3 back line).
    const role: Role = spec.role ?? (c.row === 0 ? 'tank' : c.row === 1 ? 'fighter' : c.row === 2 ? 'caster' : 'ranged');
    const items = u.items.slice(0, MAX_ITEMS);
    const unit = { key: c.key, star: u.star || 1, items, ...(u.trait ? { trait: u.trait } : {}) };
    return [{ unit, name, key: c.key, cost: c.cost, row: c.row, spec, role, power: items.length * 10 + c.cost + unit.star }];
  });
}

/** A comp's typical board placed the way players stand it: the board preview and "Open in builder" show this one. */
export function compBoard(units: Array<{ id: string; star: number; items: string[]; trait?: string }>, index: StaticIndex): BuilderBoard {
  return smartPlace(units.map((u) => ({ key: u.id, star: u.star, items: u.items, trait: u.trait })), index);
}

export function smartPlace(units: BuilderUnit[], index: StaticIndex): BuilderBoard {
  const all = describe(units, index);
  const board: BuilderBoard = {};
  const where = new Map<string, number>();
  const free = (h: number) => board[h] === undefined;
  const put = (hex: number, p: P) => {
    board[hex] = p.unit;
    where.set(p.key, hex);
  };
  /** The free hex closest to the wanted one (rows weigh more than columns, since the hexes are wider than the rows are tall). */
  const place = (p: P, row: number, col: number, avoid?: Set<number>) => {
    let best = -1;
    let bestD = Infinity;
    for (let h = 0; h < ROWS * COLS; h++) {
      if (!free(h)) continue;
      const d = Math.abs(rowOf(h) - row) * 1.6 + Math.abs(colOf(h) - col) + (rowOf(h) % 2 ? 0.01 : 0) + (avoid?.has(h) ? 2.5 : 0);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best >= 0) put(best, p);
  };

  // Who carries: the units holding the items, two at most. Tanks and supports only count when they hold three or are built to.
  const holders = all.filter((p) => p.unit.items.length >= 2 || (p.spec.carry && p.unit.items.length >= 1));
  const carries = holders
    .filter((p) => p.spec.carry !== 'tank' && ((p.role !== 'tank' && p.role !== 'support') || p.unit.items.length >= 3))
    .sort((a, b) => b.power - a.power)
    .slice(0, 2);
  const isCarry = (p: P) => carries.includes(p);
  const mainCarry = carries[0] ?? holders.filter((p) => p.spec.carry === 'tank').sort((a, b) => b.power - a.power)[0];

  const solo = all.find((p) => p.spec.solo);
  const flank = all.filter((p) => p !== solo && p.spec.carry === 'flank' && p.role === 'assassin');
  // Units that stand next to someone (a bodyguard, a partner) wait until that someone is on the board.
  const follower = (p: P) => Boolean(p.spec.nextTo) && !all.some((x) => x.name === p.spec.nextTo && x.spec.edge) && (p.spec.nextTo === '@carry' || all.some((x) => x.name === p.spec.nextTo));
  const rest0 = all.filter((p) => p !== solo && !flank.includes(p) && !follower(p));
  // Third row: units with 2-3 range (casters, Ivern, Kennen, Gnar, Elder Dragon, ...); back row: long-range units.
  const mid = rest0.filter((p) => p.spec.rows?.[0] === 2 || (p.spec.rows === undefined && p.row === 2 && (p.role === 'caster' || p.role === 'support' || p.role === 'ranged')));
  const back = rest0.filter((p) => !mid.includes(p) && (p.spec.rows?.[0] === 3 || p.role === 'ranged' || p.role === 'caster' || p.role === 'support'));
  const front = rest0.filter((p) => !mid.includes(p) && !back.includes(p));

  // Corner carries take opposite back corners; one dive or one area spell can't reach both, and the wall shields them.
  const corner = back.filter((p) => isCarry(p) && p.spec.carry === 'corner' || (isCarry(p) && p.role === 'ranged')).sort((a, b) => b.power - a.power).slice(0, 2);
  const cornerCols = [COLS - 1, 0];
  corner.forEach((p, i) => place(p, 3, cornerCols[i]));
  const mainRight = corner.length > 0 && colOf(where.get(corner[0].key)!) > 3;

  // Strongest in the middle, fighters and edge units (Fiddlesticks) toward the sides of the wall.
  const rank = (p: P) => (p.spec.edge ? -100 : 0) + (p.role === 'tank' ? 2 : 1) * 100 + p.cost * 3 + p.unit.items.length * 5 + p.unit.star;
  // Kha'Zix pairs with the main tank in the front row, on the side away from the main corner carry: Kha'Zix on the 2nd hex
  // and the tank on the 3rd, or the tank on the 5th and Kha'Zix on the 6th.
  const khazix = flank.find((p) => p.spec.withTank);
  const mainTank = khazix && (solo ?? front.filter((p) => !p.spec.edge).sort((a, b) => rank(b) - rank(a))[0]);
  const duoCols: number[] = [];
  if (khazix && mainTank) {
    const left = mainRight || corner.length === 0;
    duoCols.push(left ? 2 : 4, left ? 1 : 5);
    put(at(0, duoCols[0]), mainTank);
    put(at(0, duoCols[1]), khazix);
  }

  // Front line: a tank that stands alone takes the middle of row 0 and the rest of the line stands one row behind it.
  if (solo && !where.has(solo.key)) put(at(0, 3), solo);
  const frontRow = solo ? 1 : 0;
  // The wall: strongest in the middle; an edge unit (Fiddlesticks) takes an end with its partner (Rammus) just inside it.
  const edgeUnits = front.filter((p) => p.spec.edge);
  const partners = all.filter((p) => p.spec.nextTo && edgeUnits.some((e) => e.name === p.spec.nextTo) && !front.includes(p));
  const wallUnits = [...front.filter((p) => !p.spec.edge), ...partners.map((p) => p)].sort((a, b) => rank(b) - rank(a));
  const wallAll = [...wallUnits.filter((p) => !partners.includes(p)), ...edgeUnits, ...partners];
  const rowCap = 5;
  const firstRow = wallAll.slice(0, rowCap);
  const overflow = wallAll.slice(rowCap);
  const block = (n: number) => {
    // A block of n neighbouring hexes, centred; an even count leans toward the corner carry it protects.
    const lean = n % 2 === 0 && corner.length > 0 ? (mainRight ? 0.5 : -0.5) : 0;
    const start = Math.min(COLS - n, Math.max(0, Math.round(3 - (n - 1) / 2 + lean)));
    return Array.from({ length: n }, (_, i) => start + i);
  };
  const centreOut = (cols: number[]) => [...cols].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3) || a - b);
  // With the Kha'Zix pair in row 0 (and no solo tank), its two hexes belong to the wall.
  const pairInRow = solo ? [] : duoCols;
  const cols = block(Math.min(COLS, firstRow.length + Math.max(0, pairInRow.length - 1)));
  const taken = new Set<number>(pairInRow);
  const assign = (p: P, col: number) => {
    place(p, frontRow, col);
    taken.add(col);
  };
  edgeUnits.filter((e) => firstRow.includes(e)).forEach((e, i) => {
    const col = i % 2 === 0 ? cols[cols.length - 1] : cols[0];
    assign(e, col);
    const partner = partners.find((q) => q.spec.nextTo === e.name && firstRow.includes(q));
    if (partner) assign(partner, col + (i % 2 === 0 ? -1 : 1));
  });
  const others = firstRow.filter((p) => !taken.has(where.get(p.key) !== undefined ? colOf(where.get(p.key)!) : -1) && !where.has(p.key));
  const spare = centreOut(cols.filter((c) => !taken.has(c)));
  others.forEach((p, i) => assign(p, spare[i] ?? 3));
  const cols1 = centreOut(block(Math.min(overflow.length, 5)));
  overflow.forEach((p, i) => place(p, frontRow + 1, cols1[i] ?? 3));

  // Flank carries (assassins) stand on a side of the middle rows, on the side without the main corner carry.
  flank.filter((p) => !where.has(p.key)).forEach((p, i) => {
    const row = p.spec.rows?.[0] ?? 2;
    const left = (mainRight ? i % 2 === 0 : i % 2 === 1) || corner.length === 0 ? i % 2 === 0 : false;
    place(p, row, left ? 0 : COLS - 1);
  });

  // Bodyguards and partners stand right next to who they protect, on the enemy's side of them.
  for (const p of all.filter((x) => !where.has(x.key) && x.spec.nextTo)) {
    const target = p.spec.nextTo === '@carry' ? mainCarry : all.find((x) => x.name === p.spec.nextTo);
    const base = target && where.get(target.key);
    if (base === undefined) continue;
    const near = neighbours(base).filter(free).sort((a, b) => rowOf(a) - rowOf(b) || Math.abs(colOf(a) - 3) - Math.abs(colOf(b) - 3));
    if (near[0] !== undefined) put(near[0], p);
  }

  // Splash: keep everyone off the hexes touching a carry, so one area hit doesn't catch two units.
  const splash = new Set<number>();
  for (const p of [...carries, ...(mainCarry && !carries.includes(mainCarry) ? [mainCarry] : [])]) {
    const h = where.get(p.key);
    if (h !== undefined) neighbours(h).forEach((n) => splash.add(n));
  }
  // Back row: a unit in each back corner once there are enough long-range units, the rest spread out across the row.
  // Ahri, Alune and Lux hold the middle of the back row; they never take a corner.
  back.filter((p) => !where.has(p.key) && p.spec.rows?.[0] === 3).forEach((p) => place(p, 3, 3));
  const backers = back.filter((p) => !where.has(p.key)).sort((a, b) => b.power - a.power);
  const freeCorners = cornerCols.filter((c) => free(at(3, c)));
  // A lone long-range unit stands in a corner too (only Ahri-type units hold the middle).
  for (const c of freeCorners) {
    const p = backers.shift();
    if (p) put(at(3, c), p);
  }
  const spreadCols = [3, 1, 5, 2, 4, 0, 6];
  backers.forEach((p, i) => place(p, 3, spreadCols[i % spreadCols.length], splash));
  // Third row: spread out as well, centre first.
  mid.filter((p) => !where.has(p.key)).sort((a, b) => b.power - a.power).forEach((p, i) => place(p, 2, [3, 1, 5, 2, 4, 0, 6][i % 7], splash));
  // Bodyguards and the rest.
  for (const p of all.filter((x) => !where.has(x.key))) place(p, p.row >= 2 ? 2 : 1, 3, splash);
  return board;
}
