import { ProGate } from "@/components/ProGate";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import JournalPanel from "@/components/journalpanel";

export default function JournalPage() {
  const supabase = supabaseBrowser();

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!alive) return;
        setSignedIn(!!data.user);
      })
      .catch(() => {
        if (!alive) return;
        setSignedIn(false);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-800" />
          <div className="mt-3 h-3 w-72 animate-pulse rounded bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <ProGate feature="Journal">
        <h1 className="mb-6 text-2xl font-semibold text-white">Journal</h1>
        <JournalPanel snapshot={null} isPro={true} />
      </ProGate>

      {signedIn === false && (
        <div className="mt-4 text-xs text-slate-500">
          Note: You’re not logged in. Log in to access Journal.
        </div>
      )}
    </div>
  );
}
