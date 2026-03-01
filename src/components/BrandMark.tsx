// src/components/BrandMark.tsx
"use client";

import type React from "react";

export default function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src="/brandmark.png"
      alt="Oren Capital"
      className={className}
      draggable={false}
    />
  );
}