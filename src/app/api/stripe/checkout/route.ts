// /Users/delvinakins/capitalgrid/src/app/api/stripe/checkout/route.ts

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function firstHeaderValue(v: string | null) {
  if (!v) return null;
  return v.split(",")[0]?.trim() ?? null;
}

function isProd() {
  return process.env.NODE_ENV === "production";
}

function normalizeBaseUrl(raw: string) {
  return raw.trim().replace(/\/$/, "");
}

function getBaseUrl(req: Request) {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return normalizeBaseUrl(fromEnv);

  const proto = firstHeaderValue(req.headers.get("x-forwarded-proto")) ?? "https";
  const host =
    firstHeaderValue(req.headers.get("x-forwarded-host")) ??
    firstHeaderValue(req.headers.get("host")) ??
    "localhost:3000";

  return normalizeBaseUrl(`${proto}://${host}`);
}

function isValidRedirectUrl(u: string) {
  try {
    const parsed = new URL(u);

    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (isLocalhost) return parsed.protocol === "http:" || parsed.protocol === "https:";

    if (isProd()) return parsed.protocol === "https:";
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Idempotency: prevent accidental duplicate sessions/subscriptions on retries/double-clicks
function makeCheckoutIdempotencyKey(userId: string, priceId: string) {
  // bucket by minute so a genuine later attempt can create a new session
  const minuteBucket = Math.floor(Date.now() / 60_000);
  return `oc:checkout:${userId}:${priceId}:${minuteBucket}`;
}

type Body = {
  plan?: "pro_monthly" | "pro_annual";
  priceId?: string;
};

function getAllowedPriceIds() {
  const monthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY;
  const annual = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL;
  return {
    monthly,
    annual,
    all: [monthly, annual].filter(Boolean) as string[],
  };
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth.user;

    if (authErr || !user?.id || !user?.email) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const { monthly, annual, all } = getAllowedPriceIds();

    if (!monthly || !annual) {
      return NextResponse.json(
        {
          error:
            "Missing Stripe price env vars. Set NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY and NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL (Production).",
        },
        { status: 500 }
      );
    }

    let priceId: string | undefined;
    if (body.priceId) priceId = body.priceId;
    else if (body.plan === "pro_monthly") priceId = monthly;
    else if (body.plan === "pro_annual") priceId = annual;

    if (!priceId) {
      return NextResponse.json(
        { error: "Missing plan or priceId. Send { plan } or { priceId }." },
        { status: 400 }
      );
    }

    if (!all.includes(priceId)) {
      return NextResponse.json({ error: "Invalid priceId." }, { status: 400 });
    }

    // Ensure profile exists and fetch existing stripe_customer_id (for stable customer reuse)
    const now = new Date().toISOString();
    const { data: prof, error: profReadErr } = await supabaseAdmin
      .from("profiles")
      .select("id, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profReadErr) {
      return NextResponse.json({ error: profReadErr.message }, { status: 500 });
    }

    const { error: profileUpsertErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: user.email,
          updated_at: now,
        },
        { onConflict: "id" }
      );

    if (profileUpsertErr) {
      return NextResponse.json({ error: profileUpsertErr.message }, { status: 500 });
    }

    const baseUrl = getBaseUrl(req);
    const successUrl = `${baseUrl}/pricing?success=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/pricing?canceled=1`;

    if (!isValidRedirectUrl(successUrl) || !isValidRedirectUrl(cancelUrl)) {
      console.error("Invalid redirect URLs", { baseUrl, successUrl, cancelUrl });
      return NextResponse.json(
        {
          error:
            "Redirect URLs are invalid. Set NEXT_PUBLIC_SITE_URL to your production domain (https://orencapital.com).",
        },
        { status: 500 }
      );
    }

    const plan = body.plan ?? (priceId === monthly ? "pro_monthly" : "pro_annual");

    const idempotencyKey = makeCheckoutIdempotencyKey(user.id, priceId);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",

        // Stable linkage (best practice)
        client_reference_id: user.id,

        // Reuse existing Stripe customer when available (prevents “new customer every checkout”)
        ...(prof?.stripe_customer_id
          ? { customer: prof.stripe_customer_id }
          : { customer_email: user.email }),

        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,

        // IMPORTANT: write metadata onto the subscription itself too
        subscription_data: {
          metadata: {
            user_id: user.id,
            plan,
          },
        },

        // Keep metadata on session as well (useful during transition/debug)
        metadata: {
          user_id: user.id,
          supabase_user_id: user.id,
          plan,
        },
      },
      { idempotencyKey }
    );

    if (!session.url || typeof session.url !== "string") {
      return NextResponse.json(
        { error: "Stripe session created but no redirect URL returned." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Checkout error:", e);
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}