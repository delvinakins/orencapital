import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Use the API version required by your installed Stripe SDK types
  apiVersion: "2026-01-28.clover",
});
