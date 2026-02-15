"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  label: string;
  children: React.ReactNode;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function Tooltip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  const [pos, setPos] = useState<{ top: number; left: number; maxWidth: number } | null>(null);

  // Close on outside click / ESC
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const wrap = wrapRef.current;
      const tip = tipRef.current;
      const t = e.target as Node;

      if (wrap?.contains(t)) return; // click on trigger/label area
      if (tip?.contains(t)) return; // click inside tooltip

      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    if (open) {
      document.addEventListener("pointerdown", onPointerDown, { capture: true });
      document.addEventListener("keydown", onKeyDown);
    }

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true } as any);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Positioning: portal + clamp into viewport
  const computePosition = () => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;

    const rect = btn.getBoundingClientRect();

    // Tooltip width is now measurable (it’s rendered)
    const tipRect = tip.getBoundingClientRect();

    const padding = 12; // px
    const offsetY = 10; // px below button

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Preferred: center tooltip under button
    const idealLeft = rect.left + rect.width / 2 - tipRect.width / 2;

    // Clamp into viewport
    const left = clamp(idealLeft, padding, viewportW - tipRect.width - padding);

    // Default place below; if would go off bottom, place above
    const belowTop = rect.bottom + offsetY;
    const aboveTop = rect.top - offsetY - tipRect.height;

    const top =
      belowTop + tipRect.height <= viewportH - padding ? belowTop : clamp(aboveTop, padding, viewportH - tipRect.height - padding);

    // Max width to avoid overflow on tiny screens
    const maxWidth = viewportW - padding * 2;

    setPos({ top: top + window.scrollY, left: left + window.scrollX, maxWidth });
  };

  useLayoutEffect(() => {
    if (!open) return;
    // Wait a tick so the tooltip is in DOM and measurable
    requestAnimationFrame(() => computePosition());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onReflow = () => computePosition();

    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true); // capture scroll from nested containers too

    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <span ref={wrapRef} className="inline-flex items-center gap-2">
      <span>{label}</span>

      <span className="inline-flex">
        <button
          ref={btnRef}
          type="button"
          aria-label={`Help: ${label}`}
          aria-expanded={open}
          aria-controls={id}
          onPointerDown={(e) => {
            // Prevent the document handler (capture) from immediately closing it
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-[11px] font-semibold text-slate-200 active:scale-[0.98]"
        >
          i
        </button>

        {open && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={tipRef}
                id={id}
                role="dialog"
                aria-label={`${label} help`}
                onPointerDown={(e) =>
