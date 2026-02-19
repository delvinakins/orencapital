// src/app/labs/nba/page.tsx
import NbaClient from "./nba-client";

export const metadata = {
  title: "Labs • NBA Heat Map — Oren Capital",
  description: "Live Deviation Heat Map for NBA games.",
};

export default function NbaHeatMapPage() {
  return <NbaClient />;
}
