/// <reference lib="webworker" />

import { simulateMonteCarlo } from "./simulate";
import type { SimulationInputs, SimulationResult } from "./types";

type WorkerRequest = {
  id: string;
  kind: "simulate";
  inputs: SimulationInputs;
};

type WorkerResponse =
  | { id: string; ok: true; result: SimulationResult }
  | { id: string; ok: false; error: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  try {
    if (msg.kind !== "simulate") {
      const res: WorkerResponse = { id: msg.id, ok: false, error: "Unknown request" };
      self.postMessage(res);
      return;
    }

    const result = simulateMonteCarlo(msg.inputs);
    const res: WorkerResponse = { id: msg.id, ok: true, result };
    self.postMessage(res);
  } catch (err: any) {
    const res: WorkerResponse = { id: msg.id, ok: false, error: err?.message ?? "Worker error" };
    self.postMessage(res);
  }
};