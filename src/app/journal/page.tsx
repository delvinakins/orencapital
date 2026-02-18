import JournalClient from "./journal-client";

export default function JournalPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Oren Journal
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Structured trade logging. Calm, analytical, professional.
        </p>
      </div>

      <JournalClient />
    </div>
  );
}
