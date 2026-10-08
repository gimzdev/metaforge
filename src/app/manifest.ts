import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MetaForge | Tools for Tacticians',
    short_name: 'MetaForge',
    description: 'Teamfight Tactics meta report, comp tier list, stats explorer, team builder and player lookup.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f0d0b',
    theme_color: '#0f0d0b',
    icons: [
      { src: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
