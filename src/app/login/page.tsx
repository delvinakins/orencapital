import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-md px-6 py-16">
        <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
          <LoginClient />
        </Suspense>
      </div>
    </main>
  );
}
