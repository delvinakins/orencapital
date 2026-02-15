import { NextResponse } from "next/server";
import { isProUserByEmail } from "@/lib/pro";

export const runtime = "nodejs";

function toCsv(rows: Array<Record<string, any>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replaceAll('"', '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];

  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    // TEMP until auth: use the email you paid with
    const testEmail = "test@gmail.com";

    const isPro = await isProUserByEmail(testEmail);
    if (!isPro) {
      return NextResponse.json(
        { error: "Pro required. Please subscribe to export." },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const positions = (body?.positions ?? []) as Array<Record<string, any>>;

    const csv = toCsv(positions);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="capitalgrid-risk-engine.csv"',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Export failed" },
      { status: 500 }
    );
  }
}
