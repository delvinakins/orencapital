import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function firstHeaderValue(v: string | null) {
  if (!v) return null;
  return v.split(",")[0]?.trim() ?? null;
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

    if (process.env.NODE_ENV === "production") return parsed.protocol === "https:";
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth.user;

    if (authErr || !user?.id || !user.email) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    // Load stripe_customer_id from profiles (source of truth)
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email,stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    let customerId = prof?.stripe_customer_id ?? null;

    // If missing, create customer + persist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id, app: "orencapital" },
      });

      customerId = customer.id;

      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }

    const baseUrl = getBaseUrl(req);
    const returnUrl = `${baseUrl}/account`;

    if (!isValidRedirectUrl(returnUrl)) {
      return NextResponse.json(
        { error: "Invalid return URL. Set NEXT_PUBLIC_SITE_URL to https://orencapital.com" },
        { status: 500 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    if (!session.url) {
      return NextResponse.json({ error: "No portal URL returned." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe portal error:", err);
    return NextResponse.json({ error: err?.message || "Stripe portal error." }, { status: 500 });
  }
}