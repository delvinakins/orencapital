// src/app/admin/nba/power-rankings/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import PowerRankingsClient from "./PowerRankingsClient";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function supabaseServer() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, anon, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name, options) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}

export default async function Page() {
  const supabase = supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? null;

  if (!email) redirect("/login");
  if (!isAdminEmail(email)) redirect("/"); // or return notFound()

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-16 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">NBA Power Rankings</span>
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90" />
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
            </span>
          </h1>
          <p className="text-[15px] text-foreground/70 max-w-2xl">
            Drag to reorder. This order drives Oren Edge.
          </p>
        </header>

        <PowerRankingsClient />
      </div>
    </main>
  );
}