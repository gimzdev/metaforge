/**
 * How the header search ranks and orders results, matching the command menu it was
 * first built with (cmdk 1.1): the same fuzzy score (command-score), and the same
 * order as that menu showed on screen. That menu re-sorted the entries already on
 * screen, best first, each time the search changed, so ties keep their previous
 * order, and entries that come back after a deletion return to their place in the
 * list rather than being sorted in. Groups keep their order.
 */

/* ── command-score (MIT, used by cmdk) ──────────────────── */

const SCORE_CONTINUE_MATCH = 1;
const SCORE_SPACE_WORD_JUMP = 0.9;
const SCORE_NON_SPACE_WORD_JUMP = 0.8;
const SCORE_CHARACTER_JUMP = 0.17;
const SCORE_TRANSPOSITION = 0.1;
const PENALTY_SKIPPED = 0.999;
const PENALTY_CASE_MISMATCH = 0.9999;
const PENALTY_NOT_COMPLETE = 0.99;
const IS_GAP = /[\\/_+.#"@[({&]/;
const COUNT_GAPS = /[\\/_+.#"@[({&]/g;
const IS_SPACE = /[\s-]/;
const COUNT_SPACE = /[\s-]/g;

function scoreFrom(str: string, abbr: string, lowerStr: string, lowerAbbr: string, si: number, ai: number, memo: Record<string, number>): number {
  if (ai === abbr.length) return si === str.length ? SCORE_CONTINUE_MATCH : PENALTY_NOT_COMPLETE;
  const key = `${si},${ai}`;
  if (memo[key] !== undefined) return memo[key];
  const ch = lowerAbbr.charAt(ai);
  let index = lowerStr.indexOf(ch, si);
  let high = 0;
  while (index >= 0) {
    let score = scoreFrom(str, abbr, lowerStr, lowerAbbr, index + 1, ai + 1, memo);
    if (score > high) {
      if (index === si) {
        score *= SCORE_CONTINUE_MATCH;
      } else if (IS_GAP.test(str.charAt(index - 1))) {
        score *= SCORE_NON_SPACE_WORD_JUMP;
        const breaks = str.slice(si, index - 1).match(COUNT_GAPS);
        if (breaks && si > 0) score *= Math.pow(PENALTY_SKIPPED, breaks.length);
      } else if (IS_SPACE.test(str.charAt(index - 1))) {
        score *= SCORE_SPACE_WORD_JUMP;
        const breaks = str.slice(si, index - 1).match(COUNT_SPACE);
        if (breaks && si > 0) score *= Math.pow(PENALTY_SKIPPED, breaks.length);
      } else {
        score *= SCORE_CHARACTER_JUMP;
        if (si > 0) score *= Math.pow(PENALTY_SKIPPED, index - si);
      }
      if (str.charAt(index) !== abbr.charAt(ai)) score *= PENALTY_CASE_MISMATCH;
    }
    if (
      (score < SCORE_TRANSPOSITION && lowerStr.charAt(index - 1) === lowerAbbr.charAt(ai + 1)) ||
      (lowerAbbr.charAt(ai + 1) === lowerAbbr.charAt(ai) && lowerStr.charAt(index - 1) !== lowerAbbr.charAt(ai))
    ) {
      const transposed = scoreFrom(str, abbr, lowerStr, lowerAbbr, index + 1, ai + 2, memo);
      if (transposed * SCORE_TRANSPOSITION > score) score = transposed * SCORE_TRANSPOSITION;
    }
    if (score > high) high = score;
    index = lowerStr.indexOf(ch, index + 1);
  }
  memo[key] = high;
  return high;
}

const lowered = (s: string) => s.toLowerCase().replace(COUNT_SPACE, ' ');

/** 0 (no match) to 1 (exact). */
function commandScore(value: string, search: string): number {
  return scoreFrom(value, search, lowered(value), lowered(search), 0, 0, {});
}

/* ── Order on screen ────────────────────────────────────── */

export interface MenuRow {
  id: string;
  /** What the search is matched against (e.g. "champion Ahri"). */
  value: string;
}

export interface MenuGroup<R extends MenuRow> {
  id: string;
  rows: R[];
}

/**
 * Insert new ids the way React places new children: right before the next sibling
 * (in source order) that was already on screen, or at the end.
 */
function place(onScreen: string[], order: string[], add: string[]): string[] {
  if (!add.length) return onScreen;
  const out = [...onScreen];
  const had = new Set(onScreen);
  const at = new Map(order.map((id, i) => [id, i]));
  for (const id of [...add].sort((a, b) => at.get(a)! - at.get(b)!)) {
    let before = -1;
    for (let i = at.get(id)! + 1; i < order.length && before < 0; i++) if (had.has(order[i])) before = out.indexOf(order[i]);
    if (before < 0) out.push(id);
    else out.splice(before, 0, id);
  }
  return out;
}

/** Keeps what the menu has on screen between renders; `update` gives the next screen. */
export class MenuOrder {
  /** The search the entries are currently scored against. */
  search = '';
  /**
   * The selected entry's value. The menu picks the first entry on screen when the search
   * changes or it opens with nothing selected, and keeps a pick while it is closed.
   */
  value: string | null = null;
  /**
   * When a new search moves the pick, the menu brought the entry picked before into view
   * (if it is still listed), not the new one. The screen does the same.
   */
  scrollTo: string | null = null;
  private open = false;
  private items = new Map<string, string[]>();
  private scores = new Map<string, number>();
  private values = new Map<string, string>();

  /** `spec`: the groups that exist, each with all its entries, in order. Returns what is on screen. */
  update<G extends MenuGroup<MenuRow>>(open: boolean, spec: G[], search: string): G[] {
    type R = G['rows'][number];
    if (!open) {
      this.items.clear();
      this.scores.clear();
      this.values.clear();
      if (search !== this.search) this.value = null;
      this.search = search;
      this.open = false;
      return [];
    }
    const searched = search !== this.search;
    const rows = new Map<string, R>();
    const home = new Map<string, string>();
    for (const g of spec) for (const r of g.rows) rows.set(r.id, r), home.set(r.id, g.id);

    // Whatever went away leaves the screen.
    for (const [g, ids] of this.items) this.items.set(g, ids.filter((id) => home.get(id) === g));
    for (const id of [...this.values.keys()]) {
      if (!rows.has(id)) this.values.delete(id), this.scores.delete(id);
    }
    // New or changed entries are scored against the search the menu has...
    let added = false;
    for (const r of rows.values()) {
      if (this.values.get(r.id) === r.value) continue;
      this.values.set(r.id, r.value);
      this.scores.set(r.id, commandScore(r.value, this.search));
      added = true;
    }
    // ...a new search re-sorts what is on screen before anything comes back...
    if (search !== this.search) {
      this.search = search;
      for (const r of rows.values()) this.scores.set(r.id, commandScore(r.value, search));
      this.sort();
    }
    this.render(spec);
    // ...and new entries are sorted in once they are on screen.
    if (added) {
      this.sort();
      this.render(spec);
    }
    const screen = spec.map((g) => ({ ...g, rows: (this.items.get(g.id) ?? []).map((id) => rows.get(id)!) })).filter((g) => g.rows.length > 0);
    if (searched || (!this.open && !this.value)) {
      const first = screen[0]?.rows[0]?.value ?? null;
      if (searched && this.open && this.value && first !== this.value) this.scrollTo = this.value;
      this.value = first;
    }
    this.open = true;
    return screen;
  }

  private shown(id: string) {
    return !this.search || (this.scores.get(id) ?? 0) > 0;
  }

  private render(spec: Array<MenuGroup<MenuRow>>) {
    for (const g of spec) {
      const onScreen = (this.items.get(g.id) ?? []).filter((id) => this.shown(id));
      const had = new Set(onScreen);
      const order = g.rows.map((r) => r.id);
      this.items.set(g.id, place(onScreen, order, order.filter((id) => !had.has(id) && this.shown(id))));
    }
  }

  /** Best first; ties keep the order they had on screen. */
  private sort() {
    if (!this.search) return;
    const score = (id: string) => this.scores.get(id) ?? 0;
    for (const [g, ids] of this.items) this.items.set(g, [...ids].sort((a, b) => score(b) - score(a)));
  }
}
