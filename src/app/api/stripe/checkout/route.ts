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
  // 1) Preferred: explicitly configured site URL
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return normalizeBaseUrl(fromEnv);

  // 2) Otherwise infer from headers (works on Vercel)
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

    // Allow localhost in dev
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (isLocalhost) return parsed.protocol === "http:" || parsed.protocol === "https:";

    // In production, require https
    if (isProd()) return parsed.protocol === "https:";

    // In non-prod, allow http/https
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

type Body = {
  // old style
  plan?: "pro_monthly" | "pro_annual";
  // new style
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
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    if (!user?.id || !user?.email) {
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

    // Resolve priceId from either { priceId } or { plan }
    let priceId: string | undefined;

    if (body.priceId) {
      priceId = body.priceId;
    } else if (body.plan === "pro_monthly") {
      priceId = monthly;
    } else if (body.plan === "pro_annual") {
      priceId = annual;
    }

    if (!priceId) {
      return NextResponse.json(
        { error: "Missing plan or priceId. Send { plan } or { priceId }." },
        { status: 400 }
      );
    }

    // Prevent tampering: only allow known Pro prices
    if (!all.includes(priceId)) {
      return NextResponse.json({ error: "Invalid priceId." }, { status: 400 });
    }

    // Ensure profile exists
    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      updated_at: new Date().toISOString(),
    });

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    const baseUrl = getBaseUrl(req);
    const successUrl = `${baseUrl}/pricing?success=1`;
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      // ✅ Strong linkage for the webhook: stable Supabase user UUID
      client_reference_id: user.id,

      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,

      metadata: {
        // ✅ New standardized key (webhook will look for this)
        user_id: user.id,

        // ✅ Keep old key for backward compatibility during rollout
        supabase_user_id: user.id,

        plan: body.plan ?? (priceId === monthly ? "pro_monthly" : "pro_annual"),
      },
    });

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