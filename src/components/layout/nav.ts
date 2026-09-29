import { BookOpen, Hexagon, ListOrdered, ScrollText, SlidersHorizontal, Trophy } from 'lucide-react';

export const NAV = [
  { href: '/meta', label: 'Meta report', icon: ListOrdered },
  { href: '/explorer', label: 'Stats explorer', icon: SlidersHorizontal },
  { href: '/builder', label: 'Team builder', icon: Hexagon },
  { href: '/leaderboard', label: 'Ladder', icon: Trophy },
  { href: '/news', label: 'Patch notes', icon: ScrollText },
  { href: '/guides', label: 'Guides', icon: BookOpen },
] as const;
