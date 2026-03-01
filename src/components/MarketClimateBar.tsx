"use client";

type Climate = {
  score: number;
  label: "Stable" | "Elevated" | "High Risk";
  tone: "accent" | "neutral" | "warn";
  details: string;
};

function getTone(score: number): Climate["tone"] {
  if (score >= 75) return "accent";
  if (score >= 50) return "neutral";
  return "warn";
}

export default function MarketClimateBar({
  climate,
}: {
  climate: Climate;
}) {
  const toneColor =
    climate.tone === "accent"
      ? "bg-[color:var(--accent)]"
      : climate.tone === "warn"
      ? "bg-amber-500"
      : "bg-yellow-500";

  return (
    <div className="mt-10 space-y-3">
      <div className="text-xs tracking-wide text-foreground/60 uppercase">
        Macro Risk Climate
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="font-semibold tracking-tight">
          {climate.label}
        </div>
        <div className="text-foreground/60 tabular-nums">
          {climate.score} / 100
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-[color:var(--border)] overflow-hidden">
        <div
          className={`h-full ${toneColor} transition-all duration-500`}
          style={{ width: `${climate.score}%` }}
        />
      </div>

      <div className="text-xs text-foreground/60">
        {climate.details}
      </div>
    </div>
  );
}