// A board in Patchlab (patchlab.metaforge.lol), the balance sandbox: it opens there as blue against a sample board, ready
// to fight thousands of times. Patchlab reads champions and items by these same keys; its link carries the board as
// JSON (#s=j...), each piece [champion, stars, cell, ...items] with cells counted over both sides (blue's front row is 4).
export interface PatchlabUnit {
  key: string;
  star: number;
  items: string[];
}

export function patchlabHref(board: Record<number, PatchlabUnit>, set: number, from: string): string | null {
  const pieces = Object.entries(board).map(([hex, u]) => {
    const h = Number(hex);
    return [u.key, Math.min(3, Math.max(1, u.star)), (4 + Math.floor(h / 7)) * 7 + (h % 7), ...u.items];
  });
  if (!pieces.length) return null;
  const json = JSON.stringify({ v: 1, s: `tft${set}`, p: pieces, l: {}, q: {}, n: 5000 });
  const code = Buffer.from(json, 'utf8').toString('base64url');
  return `https://patchlab.metaforge.lol/?utm_source=metaforge&utm_content=${encodeURIComponent(from)}#s=j${code}`;
}

// The patches Patchlab has a page for (patchlab.metaforge.lol/patch/<id>): each one's balance changes fought out on the
// meta comps. The same ids as the patch notes here; Patchlab's lib/patches.ts adds each new one.
export const PATCHLAB_PATCHES = new Set(['18-6', '18-5c', '18-5b', '18-5']);

export const patchlabPatchHref = (id: string) => `https://patchlab.metaforge.lol/patch/${id}?utm_source=metaforge&utm_content=news`;
