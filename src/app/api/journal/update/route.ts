// src/app/api/journal/update/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type UpdatePayload = {
  id: string;
  updates: Record<string, unknown>;
};

const SAFE_USER_ERROR =
  "We couldn’t update that trade right now. Please try again in a moment.";

async function getSupabaseServerClient() {
  const cookieStore = await cookies(); // <-- async in your Next version

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error("Missing Supabase env vars");

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // We don't need to set cookies for these routes; avoid typing/runtime issues.
      setAll() {},
    },
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Partial<UpdatePayload>;
    const id = typeof body.id === "string" ? body.id : "";
    const updates =
      body.updates && typeof body.updates === "object" ? body.updates : null;

    if (!id || !updates) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const forbidden = new Set([
      "user_id",
      "owner_id",
      "email",
      "created_at",
      "updated_at",
    ]);

    const cleanedUpdates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (!forbidden.has(k)) cleanedUpdates[k] = v;
    }

    if (Object.keys(cleanedUpdates).length === 0) {
      return NextResponse.json({ error: "No valid updates" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("journal_trades")
      .update(cleanedUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      console.error("[journal/update] supabase error:", {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json({ error: SAFE_USER_ERROR }, { status: 500 });
    }

    return NextResponse.json({ trade: data }, { status: 200 });
  } catch (e) {
    console.error("[journal/update] unexpected error:", e);
    return NextResponse.json({ error: SAFE_USER_ERROR }, { status: 500 });
  }
}
