type Side = 'top' | 'bottom';

/** A panel's size as Floating UI measures it: its CSS size, unless that disagrees with the rounded offset size. */
export function floatingSize(el: HTMLElement) {
  const css = getComputedStyle(el);
  const width = parseFloat(css.width) || 0;
  const height = parseFloat(css.height) || 0;
  return Math.round(width) !== el.offsetWidth || Math.round(height) !== el.offsetHeight ? { width: el.offsetWidth, height: el.offsetHeight } : { width, height };
}

/**
 * Where a floating panel goes next to its anchor, the way Radix places its popovers (Floating UI's
 * offset, shift with limitShift, then flip): on `side`, `gap` px away; slid sideways to stay `pad`
 * px inside the viewport without leaving the anchor; moved to the other side when only that one
 * fits (or overflows less). It follows the anchor even off screen. Rounded to device pixels.
 */
export function placeFloating(anchor: DOMRect, box: { width: number; height: number }, side: Side, align: 'center' | 'start', gap = 8, pad = 12) {
  const vv = window.visualViewport;
  const view = vv
    ? { left: vv.offsetLeft, top: vv.offsetTop, right: vv.offsetLeft + vv.width, bottom: vv.offsetTop + vv.height }
    : { left: 0, top: 0, right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight };
  // The alignment side checked first when both sides overflow: the one the panel grows toward
  // (the other one when the anchor is the wider of the two).
  const grows = (align === 'start') !== anchor.width > box.width;
  const [near, far] = grows ? (['right', 'left'] as const) : (['left', 'right'] as const);
  const at = (s: Side) => {
    let x = align === 'center' ? anchor.left + anchor.width / 2 - box.width / 2 : anchor.left;
    const y = s === 'top' ? anchor.top - gap - box.height : anchor.bottom + gap;
    x = Math.max(x + (view.left - x + pad), Math.min(x, x - (x + box.width - view.right + pad)));
    x = Math.min(Math.max(x, anchor.left - box.width), anchor.right);
    const over = { top: view.top - y + pad, bottom: y + box.height - view.bottom + pad, left: view.left - x + pad, right: x + box.width - view.right + pad };
    return { x, y, overflows: [over[s], over[near], over[far]] };
  };
  const tried = [at(side), at(side === 'top' ? 'bottom' : 'top')];
  const pick =
    tried.find((p) => p.overflows.every((o) => o <= 0)) ??
    tried.filter((p) => p.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0] ??
    tried
      .map((p) => ({ p, sum: p.overflows.reduce((s, o) => s + Math.max(0, o), 0) }))
      .sort((a, b) => a.sum - b.sum)[0].p;
  const dpr = window.devicePixelRatio || 1;
  return { left: Math.round(pick.x * dpr) / dpr, top: Math.round(pick.y * dpr) / dpr };
}
