'use client';

import { useEffect } from 'react';
import { TriangleAlert } from '@/components/icons';

// retry() fetches the page from the server again; reset() would only re-render the payload that failed.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-5 py-16 text-center">
      <TriangleAlert className="mx-auto size-10 text-bloom" aria-hidden />
      <div>
        <h1 className="text-3xl">Something broke on this page</h1>
        <p className="mt-2 text-[15px] text-lichen">
          It&apos;s been logged on the server{error.digest ? ` (reference ${error.digest})` : ''}. Try again in a moment.
        </p>
      </div>
      <div className="flex justify-center gap-2">
        <button type="button" onClick={retry} className="inline-flex h-10 items-center rounded-lg bg-wisp px-5 text-sm font-semibold text-[#1b1306] hover:bg-[#ecc57c]">
          Try again
        </button>
        <a href="/" className="inline-flex h-10 items-center rounded-lg border border-line-strong px-5 text-sm font-medium text-lichen hover:text-moon">
          Home
        </a>
      </div>
    </div>
  );
}
