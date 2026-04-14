import type { ReactNode } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Serif, Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans"
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "BangkeBank",
  description: "Frontend-only banking dashboard prototype for BangkeBank."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${plexSerif.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
