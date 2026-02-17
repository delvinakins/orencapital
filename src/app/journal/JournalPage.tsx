"use client";

import { useEffect, useState } from "react";
import { ProGate } from "@/components/ProGate";
import { supabaseBrowser } from "@/lib/supabase/client";
import JournalPanel from "@/components/JournalPanel";

type ProStatusResponse = {
  isPro: boolean;
};

export default function JournalPage() {
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data } = await supabase.auth.getUser();
        const hasUser = Boolean(data.user?.id);

        // Pro status
        let nextIsPro = false;
        try {
          const proRes = await fetch("/api/pro/status", { cache: "no-store" });
          if (proRes.ok) {
            const proJson = (await proRes.json()) as Partial<ProStatusResponse>;
            nextIsPro = Boolean(proJson?.isPro);
          }
        } catch {
          nextIsPro = false;
        }

        // Snapshot (optional; only try if a user exists)
        let nextSnapshot: any = null;
        if (hasUser) {
          try {
            const snapRes = await fetch("/api/journal/snapshot", { cache: "no-store" });
            if (snapRes.ok) {
              nextSnapshot = await snapRes.json();
            }
          } catch {
            nextSnapshot = null;
          }
        }

        if (cancelled) return;
        setIsPro(nextIsPro);
        setSnapshot(nextSnapshot);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <ProGate>
      {loading ? (
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] p-5 text-sm text-foreground/70">
            Loading journal…
          </div>
        </div>
      ) : (
        <JournalPanel snapshot={snapshot} isPro={isPro} />
      )}
    </ProGate>
  );
}
