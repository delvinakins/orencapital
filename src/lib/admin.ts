// src/lib/admin.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function isAdminEmail(email: string | null | undefined) {
  const e = (email ?? "").trim().toLowerCase();

  // ✅ Put the exact email you use to log into Oren Capital here
  const ALLOW = new Set([
    "delvinakins@gmail.com",
    // add others if needed
  ]);

  return ALLOW.has(e);
}

export async function requireAdmin() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.id) {
    return { ok: false as const, status: 401 as const, supabase };
  }

  // ✅ Fallback admin gate by email (unblocks you even if DB trigger forces is_admin=false)
  if (isAdminEmail(user.email)) {
    return { ok: true as const, status: 200 as const, supabase };
  }

  // Otherwise require DB flag
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (profErr || !profile?.is_admin) {
    return { ok: false as const, status: 403 as const, supabase };
  }

  return { ok: true as const, status: 200 as const, supabase };
}