import { BookOpen, Hexagon, ListOrdered, ScrollText, SlidersHorizontal, Trophy } from '@/components/icons';

/** Artwork from public/assets/app (app, bg, fight_banner, learn_banner), detected in next.config.ts; '' means the built-in look. */
export const brand = {
  logo: process.env.MF_BRAND_LOGO || '',
  background: process.env.MF_BRAND_BG || '',
  fight: process.env.MF_BRAND_FIGHT || '',
  learn: process.env.MF_BRAND_LEARN || '',
};

export const NAV = [
  { href: '/meta', label: 'Meta report', icon: ListOrdered },
  { href: '/explorer', label: 'Stats explorer', icon: SlidersHorizontal },
  { href: '/builder', label: 'Team builder', icon: Hexagon },
  { href: '/news', label: 'Patch', icon: ScrollText },
  { href: '/leaderboard', label: 'Ladder', icon: Trophy },
  { href: '/guides', label: 'Guides', icon: BookOpen },
] as const;
