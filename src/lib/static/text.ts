import type { RichSeg, RichText } from './types';

/**
 * Turn CommunityDragon description markup into safe, structured segments.
 * Handles <tags>, %i:scaleXX% stat icons and @Variable@ placeholders. Values
 * are looked up by name, by the game's hashed name ({fnv1a}) and by the plain
 * data value behind a "Modified…"/"…Calc" tooltip. Anything still unknown is
 * left out rather than shown as a raw label or an invented number.
 */

type VarLookup = (name: string) => number | number[] | null | undefined;

const STYLE_TAGS: Record<string, string> = {
  magicdamage: 'magic',
  physicaldamage: 'physical',
  truedamage: 'true',
  tftbonus: 'bonus',
  scalebonus: 'bonus',
  tfthighlight: 'bonus',
  scalehealth: 'heal',
  healing: 'heal',
  tfthealing: 'heal',
  shield: 'shield',
  tftshield: 'shield',
  rules: 'rules',
  tftitemrules: 'rules',
  tftkeyword: 'keyword',
  keyword: 'keyword',
  status: 'keyword',
  spellpassive: 'label',
  spellactive: 'label',
  tftguide: 'rules',
};

const ICON_LABELS: Record<string, string> = {
  scaleap: 'AP',
  scalead: 'AD',
  scalearmor: 'Armor',
  scalemr: 'MR',
  scalehealth: 'Health',
  scaleas: 'AS',
  scalemana: 'Mana',
  scalecrit: 'Crit',
  scalecritmult: 'Crit Dmg',
  scalesv: 'Omnivamp',
  scaleda: 'Dmg Amp',
  scaledr: 'Durability',
  scalerange: 'Range',
  scalegold: 'Gold',
};

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

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

/** Names worth trying for a placeholder: itself, then the data value behind a tooltip calc. */
function candidateNames(name: string): string[] {
  const out = [name];
  const base = name.replace(/^TFT\d*_/i, '');
  const stems = [
    base,
    base.replace(/^(Modified|Tooltip|Total|Calculated|Final|Scaled|Display)(?=[A-Z])/, ''),
    base.replace(/(Calc|Calculation|Tooltip|Display)\d*$/i, ''),
    base.replace(/^(Modified|Tooltip|Total|Calculated|Final|Scaled|Display)(?=[A-Z])/, '').replace(/(Calc|Calculation|Tooltip|Display)\d*$/i, ''),
  ];
  for (const stem of stems) {
    if (stem.length >= 3 && !out.includes(stem)) out.push(stem);
  }
  return out;
}

/** Look a placeholder up by name or hashed name, trying the calc's underlying data value last. */
function lookupAny(name: string, lookup: VarLookup) {
  for (const candidate of candidateNames(name)) {
    const direct = lookup(candidate);
    if (direct !== null && direct !== undefined) return direct;
    const hashed = lookup(`{${fnv1a(candidate)}}`);
    if (hashed !== null && hashed !== undefined) return hashed;
  }
  return undefined;
}

const CALC_TOKEN = /(Calc|Calculation)\d*$|^(Modified|Tooltip|Total|Calculated)[A-Z]/;

/**
 * Newer spells print totals through tooltip calculations ("@MagicDamageCalc1@")
 * that CommunityDragon doesn't publish, while the base numbers behind them are
 * in the ability's variables (often under hashed names). Map each unresolved
 * calc, in the order the text uses them, to the next unused per-star amount
 * (at least 10 and growing with star level: damage, healing, shields), which is
 * what the tooltip shows at base stats. Percent-style values are left alone.
 */
export function inferCalcValues(
  desc: string,
  variables: Array<{ name?: string; value?: unknown }> | null | undefined,
): Map<string, number[]> {
  const table = new Map<string, number[]>();
  const order: string[] = [];
  for (const v of variables ?? []) {
    if (!v?.name || !Array.isArray(v.value) || !v.value.every((x) => typeof x === 'number')) continue;
    const key = v.name.toLowerCase();
    if (!table.has(key)) {
      table.set(key, v.value as number[]);
      order.push(key);
    }
  }
  const out = new Map<string, number[]>();
  if (!table.size || !desc) return out;
  const keyFor = (name: string) => {
    for (const candidate of candidateNames(name)) {
      const lower = candidate.toLowerCase();
      if (table.has(lower)) return lower;
      const hashed = `{${fnv1a(candidate)}}`;
      if (table.has(hashed)) return hashed;
    }
    return null;
  };
  const used = new Set<string>();
  const pending: Array<{ name: string; percent: boolean }> = [];
  for (const m of desc.matchAll(/@([^@<>\n]{1,80})@(%?)/g)) {
    const name = m[1].trim().split(/[\s*/]/)[0];
    const key = keyFor(name);
    if (key) used.add(key);
    else pending.push({ name, percent: m[2] === '%' });
  }
  const stars = (v: number[]) => (v.length >= 4 ? v.slice(1, 4) : v.slice(0, 3));
  const amount = (v: number[]) => {
    const s3 = stars(v);
    return s3.length === 3 && s3[0] >= 10 && s3[0] < s3[1] && s3[1] < s3[2];
  };
  const pool = order.filter((k) => !used.has(k) && amount(table.get(k)!));
  for (const t of pending) {
    const key = t.name.toLowerCase();
    if (out.has(key) || t.percent || !CALC_TOKEN.test(t.name)) continue;
    const next = pool.shift();
    if (!next) break;
    out.set(key, table.get(next)!);
  }
  return out;
}

/** Resolve "@Name*100@"-style expressions. Arrays are per-star values. */
function resolveVar(expr: string, lookup: VarLookup): RichSeg | null {
  const match = /^\s*([^*/\s]+)\s*(?:([*/])\s*(-?\d+(?:\.\d+)?))?\s*$/.exec(expr);
  const name = match?.[1] ?? expr;
  const op = match?.[2];
  const operand = match?.[3] !== undefined ? Number(match[3]) : undefined;
  const raw = lookupAny(name, lookup);
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    // CDragon star arrays: index 1..3 hold the 1★..3★ values.
    const stars = raw.length >= 4 ? raw.slice(1, 4) : raw;
    const values = stars
      .map((v) => (typeof v === 'number' ? applyOp(v, op, operand) : NaN))
      .filter((v) => Number.isFinite(v));
    if (!values.length || values.every((v) => v === 0)) return null;
    const uniq = values.every((v) => v === values[0]);
    return { k: 'v', v: uniq ? formatNumber(values[0]) : values.map(formatNumber).join('/') };
  }
  return { k: 'v', v: formatNumber(applyOp(raw, op, operand)) };
}

const TOKEN_RE = /<(\/?)([a-zA-Z][\w.]*)[^>]*?(\/?)>|%i:([A-Za-z0-9_]+)%|@([^@<>\n]{1,80})@/g;

export function renderRich(input: string | null | undefined, lookup: VarLookup = () => undefined): RichText {
  if (!input) return [];
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
      const seg = resolveVar(m[5], lookup);
      if (!seg) continue; // unknown value: leave it out instead of printing its internal name
      const s = style();
      out.push(s ? { ...seg, s } : seg);
    }
  }
  pushText(decodeEntities(source.slice(cursor)));

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
    if (typeof v === 'number' || (Array.isArray(v) && v.every((x) => typeof x === 'number'))) {
      table.set(k.toLowerCase(), v as number | number[]);
    }
  }
  for (const [k, v] of Object.entries(extra)) table.set(k.toLowerCase(), v);
  return (name) => table.get(name.toLowerCase());
}
