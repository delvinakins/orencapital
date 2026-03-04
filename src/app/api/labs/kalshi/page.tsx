// src/app/labs/kalshi/page.tsx
import { MoverChart, type MoverPt } from "@/components/charts/MoverChart";

export const runtime = "nodejs";

type BookLevel = { price: number; quantity: number };
type OrderbookResp = { orderbook?: { yes_bids?: BookLevel[]; no_bids?: BookLevel[] } };

type Candle = { start_ts: number; open: number; high: number; low: number; close: number };
type CandlesResp = { candlesticks?: Candle[] };

function kalshiBase() {
  return "https://api.elections.kalshi.com/trade-api/v2";
}

function bestBid(levels?: BookLevel[]) {
  if (!levels?.length) return null;
  let best = -Infinity;
  for (const l of levels) {
    const p = Number(l.price);
    if (Number.isFinite(p) && p > best) best = p;
  }
  return best === -Infinity ? null : best;
}

function normalize0to100(pts: Array<{ ts: number; v: number }>): MoverPt[] {
  if (pts.length < 2) return pts;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min;
  if (span <= 0) return pts.map((p) => ({ ts: p.ts, v: 50 }));
  return pts.map((p) => ({ ts: p.ts, v: ((p.v - min) / span) * 100 }));
}

export default async function KalshiLabsPage() {
  // V1: single market (we’ll generalize next)
  const ticker = "kxsp500addq-26mar31";
  const series = "kxsp500addq";
  const period = "60";

  // Orderbook (mid/spread)
  let mid: number | null = null;
  let spread: number | null = null;

  try {
    const obUrl = `${kalshiBase()}/markets/${encodeURIComponent(ticker)}/orderbook`;
    const obRes = await fetch(obUrl, { cache: "no-store" });
    if (obRes.ok) {
      const ob = (await obRes.json()) as OrderbookResp;
      const yesBid = bestBid(ob.orderbook?.yes_bids);
      const noBid = bestBid(ob.orderbook?.no_bids);
      const yesAsk = noBid != null ? 100 - noBid : null;

      mid =
        yesBid != null && yesAsk != null
          ? (yesBid + yesAsk) / 2
          : yesBid != null
          ? yesBid
          : yesAsk != null
          ? yesAsk
          : null;

      spread = yesBid != null && yesAsk != null ? Math.max(0, yesAsk - yesBid) : null;
    }
  } catch {
    // ignore for UI
  }

  // Candles (tape)
  let tape: MoverPt[] = [];
  try {
    const cUrl =
      `${kalshiBase()}/series/${encodeURIComponent(series)}` +
      `/markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=${encodeURIComponent(period)}`;

    const cRes = await fetch(cUrl, { cache: "no-store" });
    if (cRes.ok) {
      const data = (await cRes.json()) as CandlesResp;
      const closes = (data.candlesticks ?? []).map((c) => ({ ts: c.start_ts, v: c.close }));
      tape = normalize0to100(closes.slice(-120));
    }
  } catch {
    // ignore
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Kalshi Labs</h1>
        <p className="mt-1 text-sm text-white/60">Prediction market tape + deviation signals.</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{ticker}</div>
            <div className="mt-0.5 text-xs text-white/50">Kalshi market</div>
          </div>

          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
            <div className="text-sm text-white/70">
              Mid <span className="font-semibold text-white">{mid != null ? `${mid.toFixed(1)}¢` : "—"}</span>
            </div>
            <div className="text-sm text-white/70">
              Spread <span className="font-semibold text-white">{spread != null ? `${spread.toFixed(1)}¢` : "—"}</span>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <MoverChart data={tape} label="Tape" />
        </div>
      </div>
    </div>
  );
}