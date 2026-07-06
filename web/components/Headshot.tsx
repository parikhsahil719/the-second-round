"use client";

import { useState } from "react";

export default function Headshot({
  url,
  name,
  size = 40,
}: {
  url?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  if (!url || failed)
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center rounded-full font-semibold"
        style={{
          width: size,
          height: size,
          background: "var(--panel)",
          color: "var(--purple)",
          fontSize: size * 0.34,
          border: "1px solid var(--border)",
        }}
        aria-hidden="true"
      >
        {initials}
      </div>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="flex-shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, background: "var(--panel)" }}
    />
  );
}
