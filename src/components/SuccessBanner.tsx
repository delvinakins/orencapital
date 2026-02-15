"use client";

import { useSearchParams } from "next/navigation";

export default function SuccessBanner() {
  const sp = useSearchParams();
  const success = sp.get("success");
  const canceled = sp.get("canceled");

  if (success) {
    return (
      <div className="rounded-lg border border-green-700 bg-green-900/30 p-4 text-sm text-green-200">
        Payment successful 🎉
      </div>
    );
  }

  if (canceled) {
    return (
      <div className="rounded-lg border border-amber-700 bg-amber-900/30 p-4 text-sm text-amber-200">
        Checkout canceled.
      </div>
    );
  }

  return null;
}
