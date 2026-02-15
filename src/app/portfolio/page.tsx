import { ProGate } from "@/components/ProGate";

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <ProGate feature="Portfolio Save/Load">
        <h1 className="mb-6 text-2xl font-semibold text-white">
          Portfolio
        </h1>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-300">
          <p className="text-sm">
            Portfolio save/load functionality will live here.
          </p>

          <p className="mt-3 text-xs text-slate-500">
            This route exists to prevent navigation 404s and properly gate Pro
            functionality.
          </p>
        </div>
      </ProGate>
    </div>
  );
}
