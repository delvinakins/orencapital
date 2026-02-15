import { NextResponse } from "next/server";
import { getSubscriptionByEmail } from "@/lib/subscription";

export const runtime = "nodejs";

export async function GET() {
  // TEMP until auth: use the same email you’ve been using for Pro checks
  const testEmail = "test@gmail.com";

  const sub = await getSubscriptionByEmail(testEmail);

  return NextResponse.json({
    isPro: sub.isPro,
    status: sub.status,
    email: testEmail,
  });
}
