import "./globals.css";
import type { Metadata } from "next";
import TopNav from "@/components/TopNav";
import { Inter_Tight } from "next/font/google";

const interTight = Inter_Tight({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Oren Capital",
  description: "Risk discipline for serious traders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${interTight.variable} antialiased`}>
      <body className="min-h-screen font-sans bg-background text-foreground">
        <div className="min-h-screen bg-background text-foreground">
          <TopNav />
          <div className="mx-auto w-full">{children}</div>
        </div>
      </body>
    </html>
  );
}
