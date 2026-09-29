import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { LIGHT_THEME, THEME_STORAGE_KEY } from "@/lib/theme-config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "School OS — School Management",
    template: "%s · School OS",
  },
  description: "A modern School Management System built with Next.js",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** Runs before first paint so the saved theme is applied without a flash.
 *  The light palette is decided in ONE place: src/lib/theme-config.ts. */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});document.documentElement.setAttribute("data-theme",t||${JSON.stringify(LIGHT_THEME)});}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(LIGHT_THEME)});}})();`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
        <ThemeSwitcher />
      </body>
    </html>
  );
}
