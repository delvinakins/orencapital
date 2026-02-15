"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default function LoginClient() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const errorMsg = useMemo(() => searchParams.get("error"), [searchParams]);

  async function sendMagicLink() {
    setStatus("sending");
    setMessage("");

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // After the user clicks the email link, Supabase redirects here
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("sent");
      setMessage("Magic link sent. Check your inbox (and spam).");
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message ?? "Something went wrong.");
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Log in</h1>
        <p className="text-sm text-slate-400">
          We’ll email you a magic link.
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          Login error: {errorMsg}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm text-slate-400">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
          className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none focus:border-slate-600"
        />
      </div>

      <button
        onClick={sendMagicLink}
        disabled={status === "sending" || !email}
        className="w-full rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Send magic link"}
      </button>

      {message && (
        <div className="text-sm text-slate-300">{message}</div>
      )}

      <div className="text-xs text-slate-500">
        By continuing, you agree to our terms.
      </div>
    </div>
  );
}
