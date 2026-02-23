"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Bands = {
  p05: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
};

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function pathArea(
  top: number[],
  bottom: number[],
  w: number,
  h: number,
  minY: number,
  maxY: number
) {
  const n = Math.min(top.length, bottom.length);
  if (n < 2) return "";

  const sx = (i: number) => (i / (n - 1)) * w;
  const sy = (v: number) => {
    const t = (v - minY) / (maxY - minY || 1);
    return h - clamp(t, 0, 1) * h;
  };

  let d = `M ${sx(0).toFixed(2)} ${sy(top[0]).toFixed(2)}`;
  for (let i = 1; i < n; i++) d += ` L ${sx(i).toFixed(2)} ${sy(top[i]).toFixed(2)}`;

  d += ` L ${sx(n - 1).toFixed(2)} ${sy(bottom[n - 1]).toFixed(2)}`;
  for (let i = n - 2; i >= 0; i--) d += ` L ${sx(i).toFixed(2)} ${sy(bottom[i]).toFixed(2)}`;

  d += " Z";
  return d;
}

function pathLine(
  mid: number[],
  w: number,
  h: number,
  minY: number,
  maxY: number
) {
  const n = mid.length;
  if (n < 2) return "";

  const sx = (i: number) => (i / (n - 1)) * w;
  const sy = (v: number) => {
    const t = (v - minY) / (maxY - minY || 1);
    return h - clamp(t, 0, 1) * h;
  };

  let d = `M ${sx(0).toFixed(2)} ${sy(mid[0]).toFixed(2)}`;
  for (let i = 1; i < n; i++) d += ` L ${sx(i).toFixed(2)} ${sy(mid[i]).toFixed(2)}`;
  return d;
}

function computeMinMax(b: Bands) {
  const all = [b.p05, b.p25, b.p50, b.p75, b.p95].flat();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const v of all) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    min = 0.5;
    max = 1.5;
  }

  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

function mixArrays(a: number[], b: number[], t: number) {
  const n = Math.min(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = lerp(a[i], b[i], t);
  return out;
}

export default function EquityCone({
  bands,
  height = 240,
}: {
  bands: Bands | null;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const prevRef = useRef<Bands | null>(null);
  const [t, setT] = useState(1);

  useEffect(() => {
    if (!bands) return;
    const prev = prevRef.current;
    prevRef.current = bands;

    if (!prev) {
      setT(1);
      return;
    }

    setT(0);
    const start = performance.now();
    const dur = 420;

    let raf = 0;
    const tick = (now: number) => {
      const u = clamp((now - start) / dur, 0, 1);
      setT(easeOutCubic(u));
      if (u < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bands]);

  const effective = useMemo(() => {
    const cur = bands;
    if (!cur) return null;

    const prev = prevRef.current;
    if (!prev || t >= 0.999) return cur;

    return {
      p05: mixArrays(prev.p05, cur.p05, t),
      p25: mixArrays(prev.p25, cur.p25, t),
      p50: mixArrays(prev.p50, cur.p50, t),
      p75: mixArrays(prev.p75, cur.p75, t),
      p95: mixArrays(prev.p95, cur.p95, t),
    } satisfies Bands;
  }, [bands, t]);

  const { min, max } = useMemo(() => {
    if (!effective) return { min: 0.8, max: 1.2 };
    return computeMinMax(effective);
  }, [effective]);

  const dims = useMemo(() => {
    const width = Math.max(0, w);
    const h = height;
    const pad = 10;
    return { width, h, pad };
  }, [w, height]);

  const paths = useMemo(() => {
    if (!effective || dims.width <= 10) return null;

    const innerW = dims.width - dims.pad * 2;
    const innerH = dims.h - dims.pad * 2;

    const band95 = pathArea(effective.p95, effective.p05, innerW, innerH, min, max);
    const band75 = pathArea(effective.p75, effective.p25, innerW, innerH, min, max);
    const mid = pathLine(effective.p50, innerW, innerH, min, max);

    return { band95, band75, mid };
  }, [effective, dims, min, max]);

  return (
    <div ref={wrapRef} className="w-full">
      <div className="relative overflow-hidden rounded-lg border border-[color:var(--border)] bg-black/10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(800px 260px at 20% -10%, var(--accent-glow), transparent 60%)",
            opacity: 0.55,
          }}
        />

        <svg
          width={dims.width}
          height={dims.h}
          viewBox={`0 0 ${dims.width} ${dims.h}`}
          className="block"
        >
          <g transform={`translate(${dims.pad}, ${dims.pad})`}>
            <g opacity={0.35}>
              {[0.25, 0.5, 0.75].map((p) => (
                <line
                  key={p}
                  x1={0}
                  x2={dims.width - dims.pad * 2}
                  y1={(dims.h - dims.pad * 2) * p}
                  y2={(dims.h - dims.pad * 2) * p}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                />
              ))}
            </g>

            {paths && (
              <>
                <path
                  d={paths.band95}
                  fill="rgba(43,203,119,0.08)"
                  stroke="rgba(43,203,119,0.14)"
                  strokeWidth={1}
                />
                <path
                  d={paths.band75}
                  fill="rgba(43,203,119,0.14)"
                  stroke="rgba(43,203,119,0.20)"
                  strokeWidth={1}
                />
                <path
                  d={paths.mid}
                  fill="none"
                  stroke="rgba(231,235,232,0.78)"
                  strokeWidth={2}
                />
              </>
            )}
          </g>
        </svg>

        {!bands && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-foreground/45">
            computing…
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-foreground/50">
        <div>p05–p95 / p25–p75</div>
        <div className="tabular-nums">
          {effective ? `Scale: ${(min * 100).toFixed(0)}–${(max * 100).toFixed(0)}` : "—"}
        </div>
      </div>
    </div>
  );
}