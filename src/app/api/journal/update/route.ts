// app/api/journal/update/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type UpdatePayload = {
  id: string;
  // Allow partial updates; only provided fields will be updated
  updates: Record<string, unknown>;
};

const SAFE_USER_ERROR =
  "We couldn’t update that trade right now. Please try again in a moment.";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

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

    // Block updating owner/user fields even if client sends them.
    // (Adjust field names if your schema uses different column names.)
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

    // NOTE: assumes journal_trades has user_id column.
    // If your column is named differently, swap it here.
    const { data, error } = await supabase
      .from("journal_trades")
      .update(cleanedUpdates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) {
      // Log privately on server only
      console.error("[journal/update] supabase error:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      return NextResponse.json({ error: SAFE_USER_ERROR }, { status: 500 });
    }

    return NextResponse.json({ trade: data }, { status: 200 });
  } catch (e) {
    console.error("[journal/update] unexpected error:", e);
    return NextResponse.json({ error: SAFE_USER_ERROR }, { status: 500 });
  }
}
