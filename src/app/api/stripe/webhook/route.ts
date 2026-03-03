import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isoFromUnix(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

async function readRawBody(req: Request) {
  const buf = await req.arrayBuffer();
  return Buffer.from(buf);
}

function isUuid(v: any) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function findUserIdByStripeCustomerId(customerId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) return null;
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err?.message}` },
      { status: 400 }
    );
  }

  try {
    const t = event.type;

    const isRelevant =
      t === "checkout.session.completed" ||
      t === "customer.subscription.created" ||
      t === "customer.subscription.updated" ||
      t === "customer.subscription.deleted";

    if (!isRelevant) {
      return NextResponse.json({ ok: true, ignored: t });
    }

    let customerId: string | null = null;
    let email: string | null = null;
    let subscriptionId: string | null = null;
    let userId: string | null = null;

    // -------------------------
    // checkout.session.completed
    // -------------------------
    if (t === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

      subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      email = session.customer_details?.email ?? session.customer_email ?? null;

      const meta = (session.metadata ?? {}) as Record<string, any>;
      const maybeUid =
        (typeof session.client_reference_id === "string" ? session.client_reference_id : null) ??
        (typeof meta.user_id === "string" ? meta.user_id : null) ??
        (typeof meta.supabase_user_id === "string" ? meta.supabase_user_id : null);

      if (isUuid(maybeUid)) userId = maybeUid;
    }

    // -------------------------
    // customer.subscription.*
    // -------------------------
    if (
      t === "customer.subscription.created" ||
      t === "customer.subscription.updated" ||
      t === "customer.subscription.deleted"
    ) {
      const subObj = event.data.object as Stripe.Subscription;

      customerId =
        typeof subObj.customer === "string" ? subObj.customer : subObj.customer?.id ?? null;

      subscriptionId = subObj.id;

      // Best case: we wrote user_id into subscription metadata in checkout route
      const maybeUid = (subObj.metadata as any)?.user_id;
      if (isUuid(maybeUid)) userId = maybeUid;

      // If still missing, resolve via stripe_customer_id -> profiles.id (reliable after first checkout)
      if (!userId && customerId) {
        userId = await findUserIdByStripeCustomerId(customerId);
      }
    }

    // If we don’t have email yet, fetch customer (useful for display + fallback)
    if (!email && customerId) {
      const cust = await stripe.customers.retrieve(customerId);
      const custData = (cust as any).data ?? cust;
      email = (custData as Stripe.Customer).email ?? null;
    }

    // Subscription details (status/price/period_end)
    let subscription_status: string | null = null;
    let price_id: string | null = null;
    let current_period_end: string | null = null;

    if (subscriptionId) {
      const subRes = await stripe.subscriptions.retrieve(subscriptionId);
      const sub: Stripe.Subscription = (subRes as any).data ?? (subRes as any);

      subscription_status = sub.status ?? null;
      const item = sub.items?.data?.[0];
      price_id = item?.price?.id ?? null;
      current_period_end = isoFromUnix((sub as any).current_period_end);
    }

    // Build updates
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (email) updates.email = email;
    if (customerId) updates.stripe_customer_id = customerId;
    if (subscriptionId) updates.stripe_subscription_id = subscriptionId;

    // Only set subscription fields if we actually resolved them
    if (subscription_status || price_id || current_period_end) {
      updates.subscription_status = subscription_status;
      updates.price_id = price_id;
      updates.current_period_end = current_period_end;
    }

    // Write to Supabase:
    // Prefer stable user id always. Only fallback to email if your DB truly supports unique email upserts.
    if (userId) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert({ ...updates, id: userId }, { onConflict: "id" });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // LAST resort fallback (only safe if profiles.email is UNIQUE in DB)
    if (email) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert(updates, { onConflict: "email" });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, warned: "Updated by email fallback (consider unique email + better mapping)." });
    }

    return NextResponse.json({ ok: true, skipped: "No userId/email resolved" });
  } catch (err: any) {
    console.log("WEBHOOK ERROR:", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Webhook handler error" }, { status: 500 });
  }
}