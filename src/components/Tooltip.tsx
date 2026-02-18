"use client";

import { useEffect, useId, useRef, useState } from "react";

type TooltipProps = {
  label: string;
  children: React.ReactNode;
};

export function Tooltip({ label, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

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
      document.removeEventListener("pointerdown", onPointerDown, { capture: true } as any);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Nudge inside viewport so it doesn't clip on small screens
  useEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    if (!box) return;

    box.style.transform = "translateX(-50%)";
    requestAnimationFrame(() => {
      const r = box.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 12;

      let dx = 0;
      if (r.left < pad) dx = pad - r.left;
      if (r.right > vw - pad) dx = vw - pad - r.right;

      if (dx !== 0) box.style.transform = `translateX(calc(-50% + ${dx}px))`;
    });
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
          className="
            inline-flex h-5 w-5 items-center justify-center
            rounded-full
            border border-[color:var(--border)]
            bg-[color:var(--card)]
            text-[11px] font-semibold
            text-foreground/80
            hover:border-[color:var(--accent)]
            hover:text-[color:var(--accent)]
            active:scale-[0.98]
            transition-colors
          "
        >
          i
        </button>

        {open && (
          <div
            ref={boxRef}
            id={id}
            role="dialog"
            aria-label={`${label} help`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="
              absolute left-1/2 top-[140%] z-50
              w-[min(360px,85vw)]
              -translate-x-1/2
              rounded-xl
              border border-[color:var(--border)]
              bg-[color:var(--background)]
              px-3 py-2
              text-xs text-foreground/90
              shadow-2xl shadow-black/40
            "
          >
            {children}
            <div className="mt-2 text-[11px] text-foreground/60">
              Tap outside or press Esc to close
            </div>
          </div>
        )}
      </span>
    </span>
  );
}

export default Tooltip;
