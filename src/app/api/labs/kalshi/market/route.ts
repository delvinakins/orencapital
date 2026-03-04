import { NextResponse } from "next/server";

export const runtime = "nodejs";

type BookLevel = { price: number; quantity: number };
type OrderbookResp = {
  orderbook?: {
    yes_bids?: BookLevel[];
    no_bids?: BookLevel[];
  };
};

function kalshiBase() {
  return "https://api.elections.kalshi.com/trade-api/v2";
}

function bestBid(levels?: BookLevel[]) {
  if (!levels?.length) return null;
  let best = -Infinity;
  let qty = 0;

  for (const l of levels) {
    const p = Number(l.price);
    const q = Number(l.quantity ?? 0);
    if (!Number.isFinite(p)) continue;
    if (p > best) {
      best = p;
      qty = Number.isFinite(q) ? q : 0;
    }
  }

  return best === -Infinity ? null : { price: best, quantity: qty };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("ticker") ?? "").trim();
    const ticker = raw.toUpperCase();

    if (!ticker) {
      return NextResponse.json({ ok: false, error: "Missing ticker" }, { status: 400 });
    }

    const obUrl = `${kalshiBase()}/markets/${encodeURIComponent(ticker)}/orderbook`;
    const obRes = await fetch(obUrl, { cache: "no-store" });

    if (!obRes.ok) {
      const text = await obRes.text().catch(() => "");
      return NextResponse.json(
        { ok: false, ticker, error: `Kalshi orderbook ${obRes.status}: ${text.slice(0, 180)}` },
        { status: 502 }
      );
    }

    const ob = (await obRes.json()) as OrderbookResp;

    const yesBest = bestBid(ob.orderbook?.yes_bids);
    const noBest = bestBid(ob.orderbook?.no_bids);

    // Implied YES ask from best NO bid: yesAsk = 100 - noBid
    const yesBid = yesBest?.price ?? null;
    const yesAsk = noBest?.price != null ? 100 - noBest.price : null;

    const mid =
      yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 :
      yesBid != null ? yesBid :
      yesAsk != null ? yesAsk :
      null;

    const spread =
      yesBid != null && yesAsk != null ? Math.max(0, yesAsk - yesBid) : null;

    return NextResponse.json({
      ok: true,
      ticker,
      yesBid,
      yesAsk,
      mid,
      spread,
      yesBidQty: yesBest?.quantity ?? 0,
      noBidQty: noBest?.quantity ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}