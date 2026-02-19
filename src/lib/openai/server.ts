import "server-only";
import OpenAI from "openai";

declare global {
  // eslint-disable-next-line no-var
  var __oren_openai__: OpenAI | undefined;
}

export default function getOpenAI() {
  if (globalThis.__oren_openai__) return globalThis.__oren_openai__;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY. Add it to Vercel + .env.local.");

  const client = new OpenAI({ apiKey });
  globalThis.__oren_openai__ = client;
  return client;
}
