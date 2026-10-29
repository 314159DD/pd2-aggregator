import type { Metadata } from "next";
import { Geist, Geist_Mono, Cinzel } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/shell/SiteHeader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

// Sets the LEXADIS theme before paint: stored choice, else dark.
const THEME_SCRIPT = `try{var m=localStorage.getItem("pd2meta-theme");document.documentElement.dataset.mode=m==="light"?"light":"dark"}catch(e){document.documentElement.dataset.mode="dark"}`;

export const metadata: Metadata = {
  title: "PD2 Meta Info",
  description:
    "Aggregates Project Diablo 2 ladder builds — what items and affixes top players actually wear.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
