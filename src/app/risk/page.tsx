import type { Metadata } from "next";
import RiskClient from "./RiskClient";

export const metadata: Metadata = {
  title: "50% Drawdown Risk | Oren Capital",
  description: "Survivability-focused drawdown risk calculator.",
};

export default function RiskPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <RiskClient />
    </main>
  );
}