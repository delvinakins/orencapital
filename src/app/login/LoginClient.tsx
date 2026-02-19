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

// Never surface raw error strings from query params to end users.
function safeLoginErrorMessage(_raw: string) {
  return "Login didn’t complete. Please try again.";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function LoginClient() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const errorParam = useMemo(() => searchParams.get("error"), [searchParams]);
  const errorMsg = useMemo(() => (errorParam ? safeLoginErrorMessage(errorParam) : null), [errorParam]);

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
        // User-safe message (avoid exposing provider/internal details)
        setStatus("error");
        setMessage("Couldn’t send the magic link. Please verify your email and try again.");
        return;
      }

      setStatus("sent");
      setMessage("Magic link sent. Check your inbox (and spam).");
    } catch {
      setStatus("error");
      setMessage("Couldn’t send the magic link. Please try again in a moment.");
    }
  }

  const disabled = status === "sending" || !email.trim();

  const buttonLabel =
    status === "sending" ? "Sending…" : status === "sent" ? "Resend magic link" : "Send magic link";

  return (
    <div
      className={cn(
        "rounded-2xl border border-[color:var(--accent)]/20",
        "bg-slate-900/60",
        "p-5 sm:p-6",
        "shadow-lg shadow-black/20",
        "space-y-6"
      )}
    >
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-[color:var(--accent)]/80">
          Secure login
        </div>

        <div className="text-2xl font-semibold tracking-tight text-foreground">
          Log in
        </div>

        <div className="text-sm text-foreground/70">
          We’ll email you a magic link.
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          {errorMsg}
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm text-foreground/70">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@example.com"
          className={cn(
            "w-full h-12 rounded-xl px-4 text-[15px]",
            "border border-slate-800 bg-slate-950/40 text-foreground",
            "outline-none placeholder:text-foreground/30",
            "focus:border-[color:var(--accent)]/60 focus:ring-2 focus:ring-[color:var(--accent)]/15"
          )}
        />
      </div>

      <button
        type="button"
        onClick={sendMagicLink}
        disabled={disabled}
        className={cn(
          "w-full rounded-xl px-4 py-4 text-base font-semibold transition disabled:opacity-60",
          "bg-[color:var(--accent)] text-slate-950 hover:opacity-95",
          disabled && "cursor-not-allowed"
        )}
      >
        {buttonLabel}
      </button>

      {message && (
        <div
          className={cn(
            "text-sm",
            status === "error"
              ? "text-amber-200"
              : status === "sent"
              ? "text-[color:var(--accent)]"
              : "text-foreground/80"
          )}
        >
          {message}
        </div>
      )}

      <div className="text-center text-xs text-foreground/60">
        By continuing, you agree to our terms.
      </div>
    </div>
  );
}