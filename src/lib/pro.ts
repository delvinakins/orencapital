import { getSubscriptionByEmail } from "@/lib/subscription";

export async function isProUserByEmail(email: string) {
  const { isPro } = await getSubscriptionByEmail(email);
  return isPro;
}
