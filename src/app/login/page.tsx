import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage() {
  return (
    <main className="min-h-[calc(100vh-64px)] bg-background text-foreground">
      {/* subtle institutional glow using pine accent, not blue */}
      <div className="pointer-events-none fixed inset-0 opacity-40 [background:radial-gradient(900px_500px_at_50%_10%,rgba(43,203,119,0.10),transparent_60%)]" />
      <div className="relative mx-auto flex w-full max-w-lg flex-col px-4 py-14 sm:px-6">
        <LoginClient />
      </div>
    </main>
  );
}
