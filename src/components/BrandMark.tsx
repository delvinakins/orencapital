// src/components/BrandMark.tsx
"use client";

import Image from "next/image";

export default function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brandmark.png"
      alt="Oren Capital"
      width={32}
      height={32}
      priority
      className={className}
    />
  );
}