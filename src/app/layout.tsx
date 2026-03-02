import "./globals.css";
import type { Metadata } from "next";
import TopNav from "@/components/TopNav";
import { Inter_Tight } from "next/font/google";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${interTight.variable} antialiased`}>
      <body className="min-h-screen font-sans bg-background text-foreground">
        <div className="min-h-screen flex flex-col bg-background text-foreground">
          <TopNav />

          {/* Main Content */}
          <main className="flex-1 mx-auto w-full">{children}</main>

          {/* Footer */}
          <footer className="border-t border-neutral-800 text-sm text-neutral-400">
            <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center gap-4">
              
              <div>
                © {new Date().getFullYear()} Oren Analytics LLC
              </div>

              <div className="flex gap-6">
                <a
                  href="/terms"
                  className="hover:text-white transition-colors"
                >
                  Terms
                </a>
                <a
                  href="/privacy"
                  className="hover:text-white transition-colors"
                >
                  Privacy
                </a>
                <a
                  href="/risk-disclosure"
                  className="hover:text-white transition-colors"
                >
                  Risk Disclosure
                </a>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}