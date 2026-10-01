"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { DARK_THEME, LIGHT_THEME, THEME_STORAGE_KEY } from "@/lib/theme-config";

/**
 * Day / Night toggle — the only theme control exposed in the UI.
 *
 * Which light palette "Day" uses is decided in ONE place:
 * src/lib/theme-config.ts → LIGHT_THEME ("ocean" | "emerald" | "violet" |
 * "rose" | "amber" | "teal"). Dark mode is always "midnight".
 *
 * The anti-flash bootstrap script in layout.tsx applies the saved theme before
 * first paint; this component just flips between the two modes afterwards.
 */
/* External store over the <html data-theme> attribute: the bootstrap script
   writes it before paint, and toggle() updates it — this subscription just
   mirrors it into React (no setState-in-effect). */
function subscribeTheme(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getThemeSnapshot() {
  return document.documentElement.getAttribute("data-theme") ?? LIGHT_THEME;
}

export default function ThemeSwitcher() {
  const transitionTimer = useRef<number | undefined>(undefined);

  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => LIGHT_THEME);
  const dark = theme === DARK_THEME;

  // Clear any pending cross-fade timer on unmount.
  useEffect(() => {
    return () => {
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    };
  }, []);

  function toggle() {
    const root = document.documentElement;
    const target = dark ? LIGHT_THEME : DARK_THEME;

    if (!dark) {
      const styles = getComputedStyle(root);
      root.setAttribute("data-accent", theme);
      for (const step of ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"]) {
        root.style.setProperty(`--midnight-blue-${step}`, styles.getPropertyValue(`--color-blue-${step}`).trim());
      }
    }

    // Cross-fade the palette swap (the .theme-transition block in globals.css
    // briefly allows color transitions on every element, then removes itself).
    root.classList.add("theme-transition");
    root.setAttribute("data-theme", target);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, target);
    } catch {
      // Storage blocked (private mode) — the chosen theme simply won't persist.
    }
    // The MutationObserver subscription flips the icon automatically.

    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => root.classList.remove("theme-transition"), 500);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="print:hidden fixed bottom-5 right-5 z-50 grid h-12 w-12 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:text-blue-600 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      {/* Shows the mode you will switch TO: moon in light mode, sun in dark mode. */}
      {dark ? (
        <svg
          key="sun"
          className="theme-icon h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      ) : (
        <svg
          key="moon"
          className="theme-icon h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      )}
    </button>
  );
}
