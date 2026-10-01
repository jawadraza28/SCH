/**
 * ⭐ THEME CONFIG — THE ONE PLACE TO CHANGE YOUR SITE'S COLOR ⭐
 *
 * The UI only shows a Day / Night toggle. These constants decide which palettes
 * those two modes use. Change LIGHT_THEME below to instantly recolor every
 * light-mode screen (buttons, links, accents, badges…):
 *
 *   "ocean"   → classic blue   (default)
 *   "emerald" → fresh green
 *   "violet"  → soft purple
 *   "rose"    → warm pink
 *   "amber"   → sunset warm
 *   "teal"    → cool aqua
 *
 * Dark mode is always "midnight". The palettes themselves live in
 * src/app/globals.css as the [data-theme="..."] blocks.
 */
export const LIGHT_THEME = "rose";
export const DARK_THEME = "midnight";
export const THEME_STORAGE_KEY = "school-theme";

/**
 * Runs before first paint so the saved theme is applied without a flash.
 * Exported (not just inlined in the root layout) because `app/global-error.tsx`
 * replaces the root layout when the app crashes and must reapply the theme
 * itself — Next.js does not carry global styles or the layout's script over.
 */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||${JSON.stringify(LIGHT_THEME)};document.documentElement.setAttribute("data-theme",t);document.documentElement.setAttribute("data-accent",t===${JSON.stringify(DARK_THEME)}?${JSON.stringify(LIGHT_THEME)}:t);}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(LIGHT_THEME)});document.documentElement.setAttribute("data-accent",${JSON.stringify(LIGHT_THEME)});}})();`;
