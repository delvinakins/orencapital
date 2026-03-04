// src/lib/stripe.ts
import Stripe from "stripe";

const apiVersion: Stripe.LatestApiVersion = "2026-02-25.clover";
// If your installed stripe package expects a different version, set it to that exact value.
// (The point is: keep the type AND the value aligned.)

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion,
  typescript: true,
});