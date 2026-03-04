// lib/kalshi.ts
export type KalshiOrderbook = {
  yes: Array<[number, number]> // [price_cents, quantity]
  no: Array<[number, number]>
};

export const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2"; // public per docs

function bestBid(side?: Array<[number, number]>): number | null {
  if (!side || side.length === 0) return null;
  let best = -Infinity;
  for (const [p] of side) best = Math.max(best, p);
  return Number.isFinite(best) ? best : null;
}

export async function fetchKalshiMid(marketTicker: string) {
  const url = `${KALSHI_BASE}/markets/${encodeURIComponent(marketTicker)}/orderbook`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kalshi orderbook failed ${res.status}`);

  const data = await res.json();
  const ob = data.orderbook as KalshiOrderbook;

  const by = bestBid(ob.yes);
  const bn = bestBid(ob.no);

  if (by == null || bn == null) {
    return { marketTicker, pMid: null, yesBestBid: by, noBestBid: bn, yesBestAsk: null, spreadCents: null };
  }

  // bids-only complement (documented by Kalshi):
  // YES ASK = 100 - NO BID
  const ay = 100 - bn;

  const pMid = (by + ay) / 200;      // probability in [0,1]
  const spreadCents = ay - by;

  return { marketTicker, pMid, yesBestBid: by, noBestBid: bn, yesBestAsk: ay, spreadCents };
}