"use client";

import type { CSSProperties } from "react";
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
  const accentStyle = { "--accent": "#2BCB77" } as CSSProperties;

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
    <div style={accentStyle} className="w-full">
      <div
        className={cn(
          "rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]",
          "p-6 sm:p-7",
          "shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
        )}
      >
        <div className="space-y-3">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-foreground/70">
            Secure login
          </div>

          <div className="text-3xl font-semibold tracking-tight text-foreground">
            <span className="oren-accent relative inline-block align-baseline">
              <span className="relative z-10 text-[color:var(--accent)]">Sign in</span>
              <span
                aria-hidden
                className="oren-underline pointer-events-none absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-[0.9]"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-[0.10]"
              />
            </span>
          </div>

          <div className="text-sm text-foreground/70">
            We’ll email you a magic link. No passwords.
          </div>
        </div>

        {errorMsg && (
          <div className="mt-5 rounded-xl border border-amber-200/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            {errorMsg}
          </div>
        )}

        <div className="mt-6 space-y-2">
          <label className="text-sm text-foreground/70">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            className={cn(
              "w-full h-12 rounded-xl px-4 text-[15px]",
              "border border-[color:var(--border)] bg-black/20 text-foreground",
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
            "mt-5 w-full rounded-xl px-4 py-4 text-base font-semibold transition disabled:opacity-60",
            "bg-white text-slate-950 hover:opacity-95 active:scale-[0.98]",
            disabled && "cursor-not-allowed"
          )}
        >
          {buttonLabel}
        </button>

        {message && (
          <div
            className={cn(
              "mt-4 text-sm",
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

        <div className="mt-6 text-center text-xs text-foreground/60">
          By continuing, you agree to our terms.
        </div>
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .oren-underline {
            transform-origin: left;
            transform: scaleX(0);
            animation: oren_underline 700ms cubic-bezier(0.2, 0.8, 0.2, 1) 120ms forwards;
          }
        }
        @keyframes oren_underline {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}