import { Suspense } from "react";
import VarianceClient from "./VarianceClient";

export default function VariancePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 text-sm text-foreground/70">
          Loading variance simulator…
        </div>
      }
    >
      <VarianceClient />
    </Suspense>
  );
}
