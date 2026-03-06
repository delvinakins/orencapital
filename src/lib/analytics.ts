// src/lib/analytics.ts
import { track } from "@vercel/analytics";

type EventProps = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(eventName: string, props?: EventProps) {
  track(eventName, props);
}