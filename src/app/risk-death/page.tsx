// src/app/risk-death/page.tsx
import RiskDeathClient from "./RiskDeathClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <RiskDeathClient />;
}