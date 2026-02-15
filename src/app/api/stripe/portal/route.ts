import { NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-01-28.clover",
});

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function getAccessTokenFromCookies(): string | null {
  const store = cookies();

  const direct = store.get("sb-access-token")?.value;
  if (direct) return direct;

  const packed = store.get("supabase-auth-token")?.value;
  if (!packed) return null;

  try {
    const parsed = JSON.parse(packed);
    if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
  } catch {
    // ignore
  }

  return null;
}

async function getEmailFromSupabase(token: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnon,
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const user = (await res.json()) as { email?: string | null };
  return user.email ?? null;
}

export async function POST() {
  try {
    const token = getAccessTokenFromCookies();
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const email = await getEmailFromSupabase(token);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer =
      existing.data[0] ??
      (await stripe.customers.create({
        email,
        metadata: { app: "orencapital" },
      }));

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${getSiteUrl()}/account`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Stripe portal error." }, { status: 500 });
  }
}
