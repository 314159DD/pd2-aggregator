import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { SiteFooter } from "@/components/shell/SiteFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Sets the LEXADIS theme before paint: stored choice, else dark.
const THEME_SCRIPT = `try{var m=localStorage.getItem("pd2meta-theme");document.documentElement.dataset.mode=m==="light"?"light":"dark"}catch(e){document.documentElement.dataset.mode="dark"}`;

export const metadata: Metadata = {
  title: "PD2 Meta",
  description: "Builds and gear meta for Project Diablo 2 ladder characters.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="lx lx-stage min-h-full flex flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
