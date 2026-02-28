import { useEffect, useState } from "react";

type RiskSettings = {
  survivability_profile: "conservative" | "tactical" | "aggressive";
  capital_protection_active: boolean;
  cpm_expires_at: string | null;
  risk_cap_active: boolean;
  risk_cap_max_risk_bps: number | null;
  risk_cap_expires_at: string | null;
};

export function useRiskCap() {
  const [settings, setSettings] = useState<RiskSettings | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/risk/settings", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        setSettings(json?.settings ?? null);
      } catch {
        if (!alive) return;
        setSettings(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const effectiveCapBps =
    settings?.capital_protection_active
      ? 25
      : settings?.risk_cap_active
        ? settings?.risk_cap_max_risk_bps ?? null
        : null;

  return { settings, effectiveCapBps };
}