'use client';

// Drawn when the root layout itself fails: no game data to draw any page with (CommunityDragon unreachable and no
// saved copy), or an error nothing below caught. Next answers such a request with status 500, so it cannot pass for a
// healthy page, and the page asks not to be indexed. It replaces the whole document, so it carries its own styles.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>MetaForge is not available right now</title>
        <meta name="robots" content="noindex" />
      </head>
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeContent: 'center', padding: 24, background: '#0f0d0b', color: '#f1e9d8', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <main style={{ maxWidth: 560 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Meta<span style={{ color: '#e2b86a' }}>Forge</span>
          </p>
          <h1 style={{ margin: '28px 0 0', fontSize: 30, fontWeight: 600 }}>MetaForge is not available right now</h1>
          <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: '#b8ab94' }}>
            The site could not load its game data (champions, traits and items come from CommunityDragon) or ran into an error.
            This usually clears within minutes.
          </p>
          {error.digest && <p style={{ margin: '14px 0 0', fontSize: 12, color: '#857a68' }}>Reference: {error.digest}</p>}
          <p style={{ margin: '24px 0 0', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                reset();
                window.location.reload();
              }}
              style={{ height: 40, padding: '0 20px', border: 0, borderRadius: 8, background: '#e2b86a', color: '#1b1306', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
            <a href="/api/status" style={{ height: 40, display: 'inline-flex', alignItems: 'center', padding: '0 20px', border: '1px solid #3a342d', borderRadius: 8, color: '#f1e9d8', fontSize: 14, textDecoration: 'none' }}>
              Status
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
