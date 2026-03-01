// src/components/BrandMark.tsx
"use client";

import Image from "next/image";

export default function BrandMark() {
  return (
    <div className="relative h-9 w-9 shrink-0">
      <Image
        src="/brandmark.png"
        alt="Oren Capital"
        fill
        priority
        sizes="36px"
        className="object-contain"
      />
    </div>
  );
}