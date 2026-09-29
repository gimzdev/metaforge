/**
 * Optional artwork from public/assets/app (where MetaForge v1 kept it), detected
 * at build time in next.config.ts. Empty strings mean "use the built-in look".
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
