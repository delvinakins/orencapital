// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import TopNav from "@/components/TopNav";
import { Inter_Tight } from "next/font/google";
import Link from "next/link";
import LegalGate from "@/components/LegalGate";
import { Analytics } from "@vercel/analytics/next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Oren Capital",
  description: "Risk discipline for serious traders.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} antialiased`}>
      <body className="min-h-screen font-sans bg-background text-foreground">
        {/* Client-side gate: signed-in users must accept latest terms */}
        <LegalGate />

        <div className="min-h-screen bg-background text-foreground flex flex-col">
          <TopNav />
          <div className="mx-auto w-full flex-1">{children}</div>

          <footer className="border-t mt-10">
            <div className="mx-auto max-w-6xl px-4 py-6 text-sm flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-muted-foreground">
                © {new Date().getFullYear()} Oren Analytics LLC. All rights reserved.
              </div>

              <div className="flex flex-wrap gap-4">
                <Link className="hover:underline" href="/terms">
                  Terms
                </Link>
                <Link className="hover:underline" href="/privacy">
                  Privacy
                </Link>
                <Link className="hover:underline" href="/risk-disclosure">
                  Risk Disclosure
                </Link>
              </div>
            </div>
          </footer>
        </div>

        <Analytics />
      </body>
    </html>
  );
}