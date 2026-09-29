'use client';

import { useEffect } from 'react';
import { usePrefs } from '@/lib/prefs';

/** Adds a looked-up player to the recent searches list. */
export function RememberPlayer({ gameName, tagLine, platform }: { gameName: string; tagLine: string; platform: string }) {
  const addRecent = usePrefs((s) => s.addRecent);
  useEffect(() => {
    addRecent({ gameName, tagLine, platform });
  }, [addRecent, gameName, tagLine, platform]);
  return null;
}
