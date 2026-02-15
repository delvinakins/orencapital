import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type SavePayload = {
  id?: string;
  name: string;
  data: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SavePayload;

    if (!body?.name) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("portfolios")
      .upsert(
        {
          id: body.id,
          name: body.name,
          data: body.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      .select("id, name, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, portfolio: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
