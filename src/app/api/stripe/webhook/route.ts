// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isoFromUnix(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

// Read raw body for Stripe signature verification
async function readRawBody(req: Request) {
  const buf = await req.arrayBuffer();
  return Buffer.from(buf);
}

function isUuid(v: any) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

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
    console.log("WEBHOOK:", event.type);

    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      // 1) Figure out customer + email + subscription id (+ optional user_id)
      let customerId: string | null = null;
      let email: string | null = null;
      let subscriptionId: string | null = null;
      let userId: string | null = null;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

        subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

        email = session.customer_details?.email ?? session.customer_email ?? null;

        // Best-practice: carry your Supabase auth uid through checkout
        // Prefer: client_reference_id
        // Fallback: metadata.user_id or metadata.supabase_user_id
        const meta = (session.metadata ?? {}) as Record<string, any>;
        const maybeUid =
          (typeof session.client_reference_id === "string" ? session.client_reference_id : null) ??
          (typeof meta.user_id === "string" ? meta.user_id : null) ??
          (typeof meta.supabase_user_id === "string" ? meta.supabase_user_id : null);

        if (isUuid(maybeUid)) userId = maybeUid;

        console.log("SESSION EMAIL:", email ?? "(none)");
        console.log("CUSTOMER ID:", customerId ?? "(none)");
        console.log("SUB ID:", subscriptionId ?? "(none)");
        console.log("USER ID:", userId ?? "(none)");
      } else {
        const subObj = event.data.object as Stripe.Subscription;
        customerId = typeof subObj.customer === "string" ? subObj.customer : subObj.customer?.id ?? null;
        subscriptionId = subObj.id;
      }

      // If we don’t have email yet, fetch customer
      if (!email && customerId) {
        const cust = await stripe.customers.retrieve(customerId);
        const custData = (cust as any).data ?? cust; // support SDK shapes
        email = (custData as Stripe.Customer).email ?? null;
      }

      if (!email) {
        return NextResponse.json({ ok: true, skipped: "No email found" });
      }

      // If we don’t have subscription id, try to fetch latest subscription
      if (!subscriptionId && customerId) {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 1,
        });
        subscriptionId = subs.data[0]?.id ?? null;
      }

      // 2) Retrieve subscription details (if we have an id)
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

      // ✅ Hardening: don’t clobber existing subscription fields if we couldn't resolve subscription
      const hasSubSignal = Boolean(subscriptionId || subscription_status || price_id || current_period_end);

      // 3) Write to Supabase
      // Prefer stable user id if available; otherwise fall back to email upsert.
      const baseUpdates: any = {
        email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        updated_at: new Date().toISOString(),
      };

      if (hasSubSignal) {
        baseUpdates.subscription_status = subscription_status;
        baseUpdates.price_id = price_id;
        baseUpdates.current_period_end = current_period_end;
      }

      const { error } = userId
        ? await supabaseAdmin.from("profiles").upsert({ ...baseUpdates, id: userId }, { onConflict: "id" })
        : await supabaseAdmin.from("profiles").upsert(baseUpdates, { onConflict: "email" });

      if (error) {
        console.log("WEBHOOK ERROR: Supabase upsert error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.log("Supabase update OK for customer:", customerId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignored: event.type });
  } catch (err: any) {
    console.log("WEBHOOK ERROR:", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Webhook handler error" }, { status: 500 });
  }
}
