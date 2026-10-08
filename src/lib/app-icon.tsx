import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

const CANDIDATES = [
  ['assets/app/app.png', 'image/png'],
  ['assets/app/logo.png', 'image/png'],
  ['assets/app/app.svg', 'image/svg+xml'],
  ['assets/app/logo.svg', 'image/svg+xml'],
] as const;

const FALLBACK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 1.8 28.4 9v14L16 30.2 3.6 23V9z" fill="#e2b86a"/><path d="M16 4.6 25.9 10.3v11.4L16 27.4 6.1 21.7V10.3z" fill="#f0ce82"/><path d="M9.2 12.4h11.6c1.9 0 3.4-.5 4.3-1.2-.2 1.9-1.9 3.4-4.2 3.6-.9.1-1.5.8-1.5 1.7v.3c0 .9.6 1.6 1.4 1.8v1.1H11.8v-1.1c.8-.2 1.4-.9 1.4-1.8v-.4c0-1-.8-1.8-1.8-1.8-1.2 0-2.2-.9-2.2-2.2Z" fill="#1c0f06"/><path d="M10.6 20.6h11.2v1.4H10.6z" fill="#1c0f06"/></svg>';

/** Your logo (public/assets/app) or the built-in mark, as a data URI the image renderer can draw. */
function logoSource(): string {
  for (const [file, type] of CANDIDATES) {
    try {
      const data = readFileSync(path.join(process.cwd(), 'public', file));
      return `data:${type};base64,${data.toString('base64')}`;
    } catch {
      /* try the next one */
    }
  }
  return `data:image/svg+xml;base64,${Buffer.from(FALLBACK_SVG).toString('base64')}`;
}

/**
 * Square PNG icon for phones (home screen, tab, bookmarks): phones ignore SVG favicons and choke on large or odd-shaped
 * ones, so the logo is rendered at an exact size on the site's dark background with a safe margin.
 */
export function appIcon(size: number, padding: number) {
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0d0b' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSource()} width={Math.round(size * (1 - padding * 2))} height={Math.round(size * (1 - padding * 2))} style={{ objectFit: 'contain' }} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
