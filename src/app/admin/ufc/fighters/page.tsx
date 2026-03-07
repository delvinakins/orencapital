// src/app/admin/ufc/fighters/page.tsx
import UfcFightersClient from "./UfcFightersClient";

export const metadata = {
  title: "Admin • UFC Fighters — Oren Capital",
  description: "Admin-only UFC fighter OCR ratings and style management.",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-10 sm:py-16 space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            <span className="relative inline-block">
              <span className="relative z-10 text-[color:var(--accent)]">UFC Fighter Ratings</span>
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-[color:var(--accent)] opacity-90" />
              <span aria-hidden className="absolute inset-x-0 -bottom-1 h-[10px] rounded-full bg-[color:var(--accent)] opacity-10" />
            </span>
          </h1>
          <p className="text-[15px] text-foreground/70 max-w-2xl">
            Select a weight class, adjust OCR ratings and styles, then save. First save seeds defaults from UFC rankings.
          </p>
        </header>

        <UfcFightersClient />
      </div>
    </main>
  );
}
