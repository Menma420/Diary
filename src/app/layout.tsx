import type { Metadata } from "next";
import { getServerEnvironment } from "@/lib/env.server";
import { ownerPresentation } from "@/lib/preferences/presentation.server";
import { DEFAULT_THEME } from "@/themes/themes";
import "./globals.css";
import "@/themes/themes.css";

export const metadata: Metadata = {
  title: "Dear Diary",
  description: "A little space for your thoughts.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  getServerEnvironment();
  const { preferences }=await ownerPresentation();
  return <html lang="en" data-theme={preferences.kind==="loaded"?preferences.preferences.theme:DEFAULT_THEME}><body>{children}</body></html>;
}
