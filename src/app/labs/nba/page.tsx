// src/app/labs/nba/page.tsx
import NbaClient from "./nba-client";

export const metadata = {
  title: "Labs • NBA Deviation Watchlist — Oren Capital",
  description: "Live market move gaps vs closing line for NBA games.",
};

export default function NbaHeatMapPage() {
  return <NbaClient />;
}
