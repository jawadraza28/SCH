import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { THEME_BOOTSTRAP } from "@/lib/theme-config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Your School — School Management",
    template: "%s · School Management",
  },
  description: "A modern School Management System built with Next.js",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

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
