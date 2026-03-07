// src/app/labs/ufc/page.tsx
import UfcClient from "./ufc-client";

export const metadata = {
  title: "Labs • UFC Hype Tax — Oren Capital",
  description: "Market-implied probability vs Elo-implied probability for upcoming UFC fights.",
};

export default function UfcPage() {
  return <UfcClient />;
}
