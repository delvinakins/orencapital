"use client";

import { useEffect, useId, useRef, useState } from "react";

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = wrapRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
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
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      } as any);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="inline-flex items-center gap-2">
      <span>{label}</span>

      <span className="relative inline-flex">
        <button
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

        {open && (
          <div
            id={id}
            role="dialog"
            aria-label={`${label} help`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute left-1/2 top-[140%] z-50 w-[min(360px,85vw)] -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 shadow-lg"
          >
            {children}
            <div className="mt-2 text-[11px] text-slate-400">
              Tap outside or press Esc to close
            </div>
          </div>
        )}
      </span>
    </span>
  );
}
