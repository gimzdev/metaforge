import type { RichSeg, RichText } from './types';

// CommunityDragon description markup (<tags>, %i:scaleXX% stat icons, @Variable@ placeholders) as safe, structured segments.
// Values are looked up by name, by the game's hashed name ({fnv1a}) and by the data value behind a "Modified…"/"…Calc"
// tooltip; anything still unknown is left out rather than shown as a raw label or an invented number.

type VarLookup = (name: string) => number | number[] | null | undefined;

const STYLE_TAGS: Record<string, string> = {
  magicdamage: 'magic', physicaldamage: 'physical', truedamage: 'true',
  tftbonus: 'bonus', scalebonus: 'bonus', tfthighlight: 'bonus',
  scalehealth: 'heal', healing: 'heal', tfthealing: 'heal',
  shield: 'shield', tftshield: 'shield',
  rules: 'rules', tftitemrules: 'rules', tftguide: 'rules',
  tftkeyword: 'keyword', keyword: 'keyword', status: 'keyword',
  spellpassive: 'label', spellactive: 'label',
};

const ICON_LABELS: Record<string, string> = {
  scaleap: 'AP', scalead: 'AD', scalearmor: 'Armor', scalemr: 'MR', scalehealth: 'Health', scaleas: 'AS', scalemana: 'Mana',
  scalecrit: 'Crit', scalecritmult: 'Crit Dmg', scalesv: 'Omnivamp', scaleda: 'Dmg Amp', scaledr: 'Durability', scalerange: 'Range', scalegold: 'Gold',
};

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

function decodeEntities(text: string) {
  return text.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m);
}

function humanizeVar(name: string): string {
  if (/^\{[0-9a-f]+\}$/i.test(name)) return 'value';
  const last = name.split(/[.:]/).filter(Boolean).pop() ?? name;
  return (
    last
      .replace(/^(TFT\d*_?|Modified|Total|Calculated|Final|Base)(?=[A-Z])/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .trim() || 'value'
  );
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '?';
  const abs = Math.abs(n);
  if (abs >= 100) return String(Math.round(n));
  if (abs >= 10) return String(Math.round(n * 10) / 10);
  return String(Math.round(n * 100) / 100);
}

function applyOp(value: number, op?: string, operand?: number) {
  if (!op || operand === undefined || !Number.isFinite(operand)) return value;
  return op === '*' ? value * operand : operand !== 0 ? value / operand : value;
}

/** 32-bit FNV-1a of the lowercased name, the way the game hashes data value names. */
function fnv1a(name: string): string {
  let h = 0x811c9dc5;
  const text = name.toLowerCase();
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const CALC_PREFIX = /^(Modified|Tooltip|Total|Calculated|Final|Scaled|Display)(?=[A-Z])/;
const CALC_SUFFIX = /(Calc|Calculation|Tooltip|Display)\d*$/i;

/** Names worth trying for a placeholder: itself, then the data value behind a tooltip calc. */
function candidateNames(name: string): string[] {
  const out = [name];
  const base = name.replace(/^TFT\d*_/i, '');
  for (const stem of [base, base.replace(CALC_PREFIX, ''), base.replace(CALC_SUFFIX, ''), base.replace(CALC_PREFIX, '').replace(CALC_SUFFIX, '')]) {
    if (stem.length >= 3 && !out.includes(stem)) out.push(stem);
  }
  return out;
}

/** What a calc's name is reduced to when looking for its data value ("MagicDamageCalc2" and "ModifiedMagicDamage" both give "magicdamage"). */
const stemOf = (name: string) => name.replace(/^TFT\d*_/i, '').replace(CALC_PREFIX, '').replace(CALC_SUFFIX, '').toLowerCase();

/**
 * Look a placeholder up by name or hashed name, trying the calc's underlying data value last. `exact` keeps to the
 * placeholder's own name: for a description whose placeholders share one stem, the data value can stand for one of
 * them at most, and nothing says which.
 */
function lookupAny(name: string, lookup: VarLookup, exact = false) {
  for (const candidate of exact ? [name] : candidateNames(name)) {
    const direct = lookup(candidate);
    if (direct !== null && direct !== undefined) return direct;
    const hashed = lookup(`{${fnv1a(candidate)}}`);
    if (hashed !== null && hashed !== undefined) return hashed;
  }
  return undefined;
}

/** Resolve "@Name*100@"-style expressions. Arrays are per-star values. */
const VAR_EXPR = /^\s*([^*/\s]+)\s*(?:([*/])\s*(-?\d+(?:\.\d+)?))?\s*$/;

function resolveVar(expr: string, lookup: VarLookup, exact: (name: string) => boolean): RichSeg | null {
  const match = VAR_EXPR.exec(expr);
  const name = match?.[1] ?? expr;
  const op = match?.[2];
  const operand = match?.[3] !== undefined ? Number(match[3]) : undefined;
  const raw = lookupAny(name, lookup, exact(name));
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    // CDragon star arrays: index 1..3 hold the 1★..3★ values.
    const stars = raw.length >= 4 ? raw.slice(1, 4) : raw;
    const values = stars.map((v) => (typeof v === 'number' ? applyOp(v, op, operand) : NaN)).filter((v) => Number.isFinite(v));
    if (!values.length || values.every((v) => v === 0)) return null;
    const uniq = values.every((v) => v === values[0]);
    return { k: 'v', v: uniq ? formatNumber(values[0]) : values.map(formatNumber).join('/') };
  }
  return { k: 'v', v: formatNumber(applyOp(raw, op, operand)) };
}

const TOKEN_RE = /<(\/?)([a-zA-Z][\w.]*)[^>]*?(\/?)>|%i:([A-Za-z0-9_]+)%|@([^@<>\n]{1,80})@/g;

/** The mark that stands for a number the game data does not hold (see `gaps` below). */
const GAP: RichSeg = { k: 'v', v: '…', s: 'gap' };

/**
 * `gaps`: a value the data does not hold shows as "…" instead of vanishing. Champion abilities ask for it: without
 * their numbers the sentences read "gain Shield for seconds".
 */
export function renderRich(input: string | null | undefined, lookup: VarLookup = () => undefined, opts: { gaps?: boolean } = {}): RichText {
  if (!input) return [];
  // Placeholders that share a stem with another one of this text ("MagicDamageCalc1" and "MagicDamageCalc2"): only
  // their own names are looked up, so two different totals never both print the one "MagicDamage" value.
  const stems = new Map<string, Set<string>>();
  for (const m of input.matchAll(/@([^@<>\n]{1,80})@/g)) {
    const name = VAR_EXPR.exec(m[1])?.[1] ?? m[1];
    const stem = stemOf(name);
    stems.set(stem, (stems.get(stem) ?? new Set()).add(name.toLowerCase()));
  }
  const exact = (name: string) => (stems.get(stemOf(name))?.size ?? 0) > 1;
  const out: RichSeg[] = [];
  const styles: string[] = [];
  const style = () => styles[styles.length - 1];
  const pushText = (text: string) => {
    if (!text) return;
    const s = style();
    const last = out[out.length - 1];
    if (last && last.k === 't' && last.s === s) last.v = (last.v ?? '') + text;
    else out.push(s ? { k: 't', v: text, s } : { k: 't', v: text });
  };

  let cursor = 0;
  // Some strings carry escaped newlines ("\\n") instead of <br>.
  const source = input.replace(/\r/g, '').replace(/\\n/g, '<br>');
  for (const m of source.matchAll(TOKEN_RE)) {
    pushText(decodeEntities(source.slice(cursor, m.index)));
    cursor = (m.index ?? 0) + m[0].length;
    if (m[2]) {
      const tag = m[2].toLowerCase();
      const closing = m[1] === '/';
      if (tag === 'br') {
        out.push({ k: 'n' });
        continue;
      }
      const mapped = STYLE_TAGS[tag];
      if (!mapped) continue;
      if (closing) {
        const at = styles.lastIndexOf(mapped);
        if (at >= 0) styles.splice(at, 1);
      } else if (m[3] !== '/') {
        styles.push(mapped);
      }
    } else if (m[4]) {
      const key = m[4].toLowerCase();
      out.push({ k: 'i', v: ICON_LABELS[key] ?? humanizeVar(m[4].replace(/^scale/i, '')) });
    } else if (m[5]) {
      const seg = resolveVar(m[5], lookup, exact);
      if (!seg) {
        // Unknown value: never its internal name. Left out, or marked where the caller asked for the mark.
        if (opts.gaps) out.push({ ...GAP });
        continue;
      }
      const s = style();
      out.push(s ? { ...seg, s } : seg);
    }
  }
  pushText(decodeEntities(source.slice(cursor)));

  // A mark alone on its line, or trailing a finished sentence, stands for something only a running game fills in (a
  // list, a tracker with no label): out.
  if (opts.gaps) {
    const isGap = (seg: RichSeg) => seg.k === 'v' && seg.s === 'gap';
    const blank = (seg: RichSeg) => seg.k === 't' && !(seg.v ?? '').trim();
    for (let start = 0; start <= out.length; ) {
      let end = start;
      while (end < out.length && out[end].k !== 'n') end++;
      const line = out.slice(start, end);
      if (line.some(isGap) && line.every((seg) => isGap(seg) || blank(seg))) {
        out.splice(start, end - start);
        end = start;
      } else {
        let last = end - 1;
        while (last > start && blank(out[last])) last--;
        const before = out[last - 1];
        if (last > start && isGap(out[last]) && before.k === 't' && /[.!?]\s*$/.test(before.v ?? '')) {
          out.splice(last, 1);
          end--;
        }
      }
      start = end + 1;
    }
  }

  // Tidy the gaps a dropped value leaves behind ("dealing  damage", "( )", " .").
  for (let i = 0; i < out.length; i++) {
    const seg = out[i];
    if (seg.k !== 't' || !seg.v) continue;
    const next = out[i + 1];
    seg.v = seg.v.replace(/ {2,}/g, ' ').replace(/\(\s*\)/g, '');
    if (next && next.k === 't' && next.v && /^[.,;:!?)]/.test(next.v)) seg.v = seg.v.replace(/\s+$/, '');
    if (i > 0 && out[i - 1].k === 't' && /\s$/.test(out[i - 1].v ?? '')) seg.v = seg.v.replace(/^ +/, '');
    seg.v = seg.v.replace(/ +([.,;:!?)])/g, '$1');
  }
  for (let i = out.length - 1; i >= 0; i--) if (out[i].k === 't' && !out[i].v) out.splice(i, 1);

  // Trim leading/trailing breaks and collapse runs of more than two.
  while (out.length && out[0].k === 'n') out.shift();
  while (out.length && out[out.length - 1].k === 'n') out.pop();
  const collapsed: RichSeg[] = [];
  for (const seg of out) {
    const prev = collapsed[collapsed.length - 1];
    const prev2 = collapsed[collapsed.length - 2];
    if (seg.k === 'n' && prev?.k === 'n' && prev2?.k === 'n') continue;
    collapsed.push(seg);
  }
  return collapsed;
}

/** Split a trait description into its header text and per-breakpoint rows. */
export function splitTraitDescription(desc: string): { header: string; rows: string[]; expand: string | null } {
  const rows: string[] = [];
  let expand: string | null = null;
  const header = desc
    .replace(/<expandRow>([\s\S]*?)<\/expandRow>/gi, (_, inner: string) => {
      expand ??= inner;
      return '';
    })
    .replace(/<row>([\s\S]*?)<\/row>/gi, (_, inner: string) => {
      rows.push(inner);
      return '';
    })
    .replace(/(<br\s*\/?>\s*)+$/gi, '')
    .trim();
  return { header, rows, expand };
}

/** Case-insensitive lookup into a variables map. */
export function mapLookup(vars: Record<string, unknown> | null | undefined, extra: Record<string, number> = {}): VarLookup {
  const table = new Map<string, number | number[]>();
  for (const [k, v] of Object.entries(vars ?? {})) {
    if (typeof v === 'number' || (Array.isArray(v) && v.every((x) => typeof x === 'number'))) table.set(k.toLowerCase(), v as number | number[]);
  }
  for (const [k, v] of Object.entries(extra)) table.set(k.toLowerCase(), v);
  return (name) => table.get(name.toLowerCase());
}
