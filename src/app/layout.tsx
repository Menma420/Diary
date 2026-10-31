import type { Metadata } from "next";
import { getServerEnvironment } from "@/lib/env.server";
import { DEFAULT_THEME } from "@/themes/themes";
import "./globals.css";
import "@/themes/themes.css";

export const metadata: Metadata = {
  title: "Dear Diary",
  description: "A little space for your thoughts.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  getServerEnvironment();
  return <html lang="en" data-theme={DEFAULT_THEME}><body>{children}</body></html>;
}
