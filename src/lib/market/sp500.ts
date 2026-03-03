// src/lib/market/sp500.ts
/**
 * Lightweight S&P 500 universe list.
 * This is intentionally a static allowlist so we never surface penny-stock chaos.
 *
 * You can expand/refresh this list anytime. Movers endpoint will sample from it.
 */
export const SP500_SYMBOLS: string[] = [
  "AAPL","MSFT","AMZN","NVDA","GOOGL","GOOG","META","BRK.B","LLY","AVGO","JPM","V","XOM","UNH","MA","COST",
  "PG","JNJ","HD","ORCL","ABBV","CRM","BAC","KO","WMT","CVX","MRK","ADBE","NFLX","AMD","PEP","TMO","ACN",
  "CSCO","LIN","QCOM","DHR","WFC","MCD","INTU","TXN","ABT","PM","AMAT","GE","NOW","IBM","GS","AXP","CAT",
  "ISRG","SPGI","DIS","VZ","MS","RTX","UNP","PFE","AMGN","LOW","INTC","HON","COP","CMCSA","BKNG","NKE",
  "UPS","DE","MDT","SCHW","LMT","T","NEE","BLK","BA","SBUX","ELV","C","VRTX","ADP","GILD","TJX","CI",
  "MMC","CB","PGR","SYK","MO","CME","SO","MDLZ","ZTS","DUK","EQIX","BDX","REGN","APD","ETN","EOG","ITW",
  "AON","TGT","CSX","HCA","CL","MU","MRNA","SNPS","NXPI","FISV","PH","BSX","WM","ICE","PSX","FCX","SLB",
  "MPC","ORLY","PNC","EMR","GM","F","DAL","LUV","MAR","HLT","ROST","KDP","AFL","TRV","ADSK","FDX","KHC",
  "PXD","OXY","NOC","GD","PPL","SPG","TT","CARR","MCK","ECL","AZO","MET","AIG","ALL","CNC","CTAS","VLO",
  "SRE","D","PAYX","FICO","MSI","WBA","BIIB","IDXX","CMG","ODFL","EA","ILMN","ROK","WEC","STZ","PSA",
  "DG","DLTR","PCAR","EXC","AEP","TTWO","FAST","KR","PEG","ED","ETR","WMB","OKE","KMI","COF","BK","AMP",
  "IQV","PRU","DFS","TEL","XEL","HPQ","GLW","EBAY","WBD","PLTR"
];

// If you want to keep it deterministic but still “fresh”, we rotate by day.
export function dailyRotate<T>(arr: T[], n: number, seed: number) {
  if (arr.length === 0) return [];
  const out: T[] = [];
  let idx = seed % arr.length;
  for (let i = 0; i < n; i++) {
    out.push(arr[idx]);
    idx = (idx + 1) % arr.length;
  }
  return out;
}