import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SmeSettingsProvider } from "../src/components/dashboard/SmeSettingsContext";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "ReconPilot MVP Extraction",
  description: "Three-document extraction workflow for ReconPilot"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <SmeSettingsProvider>{children}</SmeSettingsProvider>
      </body>
    </html>
  );
}
