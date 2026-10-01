import { BookOpen, Hexagon, ListOrdered, ScrollText, SlidersHorizontal, Trophy } from '@/components/icons';

/**
 * Artwork from public/assets/app, detected at build time in next.config.ts.
 * Empty strings mean "use the built-in look".
 *
 *   app.png           logo and favicon
 *   bg.jpg            page background and home hero
 *   fight_banner.jpg  call-to-action and ladder banners
 *   learn_banner.jpg  guides and profile banners
 */
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
