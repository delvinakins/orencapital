export type VolLevel = "LOW" | "MED" | "HIGH" | "EXTREME";

export type SimulationInputs = {
  riskPerTrade: number;   // 0.01 for 1%
  winRate: number;        // 0.52 for 52%
  avgR: number;           // 1.15
  volLevel: VolLevel;
  paths: number;
};

export type SimulationResult = {
  dd50Risk: number;
  horizonTrades: number;
  bands: {
    p05: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
};