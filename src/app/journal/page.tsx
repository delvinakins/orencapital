// FILE: src/app/journal/page.tsx
import JournalClient from "./journal-client";

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-10 sm:py-16">
        <JournalClient />
      </div>
    </main>
  );
}