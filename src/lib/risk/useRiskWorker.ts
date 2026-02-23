"use client";

import { useEffect, useRef, useState } from "react";
import type { SimulationInputs, SimulationResult } from "./types";

type WorkerResponse =
  | { id: string; ok: true; result: SimulationResult }
  | { id: string; ok: false; error: string };

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function useRiskWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingIdRef = useRef<string | null>(null);

  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Bundled worker
    workerRef.current = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });

    const w = workerRef.current;

    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;

      // Ignore stale results
      if (!pendingIdRef.current || msg.id !== pendingIdRef.current) return;

      setIsComputing(false);

      if (msg.ok) {
        setError(null);
        setResult(msg.result);
      } else {
        setError(msg.error);
      }
    };

    w.onerror = () => {
      setIsComputing(false);
      setError("Worker crashed");
    };

    return () => {
      w.terminate();
      workerRef.current = null;
      pendingIdRef.current = null;
    };
  }, []);

  const run = (inputs: SimulationInputs) => {
    const w = workerRef.current;
    if (!w) return;

    const id = uid();
    pendingIdRef.current = id;
    setIsComputing(true);
    setError(null);

    w.postMessage({ id, kind: "simulate", inputs });
  };

  return { result, isComputing, error, run };
}