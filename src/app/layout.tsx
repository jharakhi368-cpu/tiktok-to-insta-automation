import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "REELAY — TT → IG Relay Console",
  description:
    "Pick a cover, write the caption, set an air time — REELAY publishes your TikToks to Instagram as Reels.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base text-ink antialiased">{children}</body>
    </html>
  );
}
