// lib/kalshi.ts
export type KalshiOrderbook = {
  market_ticker: string
  yes: Array<[number, number]> // [price_cents, size]
  no: Array<[number, number]>
}

function bestBid(side: Array<[number, number]>): number | null {
  if (!side?.length) return null
  // Docs: orderbook returns bids; assume sorted best->worse, but be safe:
  return side.reduce((best, [p]) => (p > best ? p : best), -Infinity)
}

export async function fetchKalshiMidProb(marketTicker: string) {
  // Docs endpoint: GET /markets/{ticker}/orderbook
  // (Exact base URL varies by environment; docs show trade-api/v2 structure.)
  const url = `https://api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(
    marketTicker
  )}/orderbook`

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Kalshi orderbook fetch failed: ${res.status}`)

  const data = (await res.json()) as { orderbook: KalshiOrderbook }
  const ob = data.orderbook

  const by = bestBid(ob.yes)
  const bn = bestBid(ob.no)

  if (by == null || bn == null) {
    return {
      marketTicker,
      pMid: null,
      yesBestBid: by,
      noBestBid: bn,
      yesBestAsk: null,
      spreadCents: null,
    }
  }

  // bids-only math from Kalshi docs:
  // YES ask = 100 - NO bid
  const ay = 100 - bn

  const pMid = (by + ay) / 200 // convert cents to probability
  const spreadCents = ay - by

  return {
    marketTicker,
    pMid,
    yesBestBid: by,
    noBestBid: bn,
    yesBestAsk: ay,
    spreadCents,
  }
}