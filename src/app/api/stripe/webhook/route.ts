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
    return NextResponse.json({ error: `Webhook signature verification failed: ${err?.message}` }, { status: 400 });
  }

  try {
    // Helpful log while developing
    console.log("WEBHOOK:", event.type);

    // We primarily care about subscription lifecycle
    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      // 1) Figure out customer + email + subscription id
      let customerId: string | null = null;
      let email: string | null = null;
      let subscriptionId: string | null = null;

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
        subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;

        email =
          session.customer_details?.email ??
          session.customer_email ??
          null;

        console.log("SESSION EMAIL:", email ?? "(none)");
        console.log("CUSTOMER ID:", customerId ?? "(none)");
        console.log("SUB ID:", subscriptionId ?? "(none)");
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

      // If we don’t have subscription id, try to fetch active subscription
      if (!subscriptionId && customerId) {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 1,
        });
        subscriptionId = subs.data[0]?.id ?? null;
      }

      // 2) If we have subscription, retrieve it and normalize shape for TS
      let subscription_status: string | null = null;
      let price_id: string | null = null;
      let current_period_end: string | null = null;

      if (subscriptionId) {
        const subRes = await stripe.subscriptions.retrieve(subscriptionId);
        const sub: Stripe.Subscription = (subRes as any).data ?? (subRes as any);

        subscription_status = sub.status ?? null;

        const item = sub.items?.data?.[0];
        const priceId = item?.price?.id ?? null;
        price_id = priceId;

        current_period_end = isoFromUnix((sub as any).current_period_end);
      }

      // 3) Write to Supabase by email
      const updates = {
        email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status,
        price_id,
        current_period_end,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin
        .from("profiles")
        .upsert(updates, { onConflict: "email" });

      if (error) {
        console.log("WEBHOOK ERROR: Supabase upsert error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.log("Supabase update OK for customer:", customerId);
      return NextResponse.json({ ok: true });
    }

    // Ignore other events
    return NextResponse.json({ ok: true, ignored: event.type });
  } catch (err: any) {
    console.log("WEBHOOK ERROR:", err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? "Webhook handler error" }, { status: 500 });
  }
}
