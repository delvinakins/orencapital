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

  const disabled = status === "sending" || !email;

  return (
    <div className="oc-glass space-y-6 rounded-2xl p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="text-sm text-foreground/70">We’ll email you a magic link.</p>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3 text-sm text-amber-100">
          Login error: {errorMsg}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm text-foreground/70">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
          className={[
            "w-full h-12 rounded-lg px-4",
            "border border-[color:var(--border)] bg-background text-foreground",
            "outline-none",
            "focus:border-[color:var(--accent)]/60 focus:ring-2 focus:ring-[color:var(--accent)]/15",
            "placeholder:text-foreground/30",
          ].join(" ")}
        />
      </div>

      <button
        onClick={sendMagicLink}
        disabled={disabled}
        className={`w-full oc-btn oc-btn-primary ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {status === "sending" ? "Sending…" : status === "sent" ? "Resend magic link" : "Send magic link"}
      </button>

      {message && (
        <div className={`text-sm ${status === "error" ? "text-amber-100" : "text-foreground/80"}`}>{message}</div>
      )}

      <div className="text-xs text-foreground/60">By continuing, you agree to our terms.</div>
    </div>
  );
}
