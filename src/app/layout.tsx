import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { GlobalCommandPalette } from "@/components/global-command-palette";
import { ReaderTypographyController } from "@/components/reader-typography";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The editorial voice: brand, view titles, and the reading canvas.
// Self-hosted at build time by next/font — no runtime font requests.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "rssapp",
  description: "A self-hosted RSS reader",
};

// Applies the saved theme (or the system preference) to <html> before the first
// paint, so there's no flash. Server-rendered into <head> — unlike next-themes'
// provider, it never emits a <script> during a client render (which React 19
// warns about). The "theme" key must match THEME_STORAGE_KEY in theme-provider.
const THEME_SCRIPT = `(function(){try{var e=document.documentElement,t=localStorage.getItem("theme")||"system",d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full`}
      // The inline script below sets the theme class before hydration; the
      // resulting class/style mismatch on <html> is intentional.
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, app-built no-flash theme script */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <ReaderTypographyController />
          <GlobalCommandPalette />
        </ThemeProvider>
      </body>
    </html>
  );
}
