// src/lib/supabase/service.ts
import { createClient } from "@supabase/supabase-js";

function must(name: string, v: string | undefined) {
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function supabaseService() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return createClient(
    must("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)", url),
    must("SUPABASE_SERVICE_ROLE_KEY", serviceKey),
    {
      auth: { persistSession: false },
    }
  );
}