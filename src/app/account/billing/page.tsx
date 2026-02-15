"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProStatus = {
  isPro: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export default function BillingPage() {
  const [data, setData] = useState<ProStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchStatus = async () => {
      const res = await fetch("/api/pro/status");
      const json = await res.json();
      setData(json);
      setLoading(false);
    };

    fetchStatus();
  }, []);

  if (loading) {
    return (
      <div className="p-6 text-slate-400 text-sm">
        Loading billing details...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-red-400 text-sm">
        Unable to load billing information.
      </div>
    );
  }

  const formattedDate = data.currentPeriodEnd
    ? new Date(data.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold text-white mb-6">
        Account Billing
      </h1>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <p className="text-sm text-slate-400">Plan</p>
          <p className="text-lg text-white font-medium">
            {data.isPro ? "Pro" : "Free"}
          </p>
        </div>

        {data.isPro && (
          <>
            <div>
              <p className="text-sm text-slate-400">Status</p>
              <p className="text-white capitalize">
                {data.subscriptionStatus}
              </p>
            </div>

            {formattedDate && (
              <div>
                <p className="text-sm text-slate-400">
                  {data.cancelAtPeriodEnd
                    ? "Ends On"
                    : "Renews On"}
                </p>
                <p className="text-white">{formattedDate}</p>
              </div>
            )}

            <button
              onClick={() => router.push("/api/stripe/portal")}
              className="w-full mt-4 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium py-2 rounded-lg transition"
            >
              Manage Billing
            </button>
          </>
        )}

        {!data.isPro && (
          <>
            <div className="text-sm text-slate-400 space-y-1">
              <p>Upgrade to Pro to unlock:</p>
              <ul className="list-disc list-inside">
                <li>Journal</li>
                <li>CSV Export</li>
                <li>Portfolio Save</li>
                <li>Advanced Simulation</li>
              </ul>
            </div>

            <button
              onClick={() => router.push("/pricing")}
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2 rounded-lg transition"
            >
              Upgrade to Pro
            </button>
          </>
        )}
      </div>
    </div>
  );
}
