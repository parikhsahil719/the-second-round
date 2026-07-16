"use client";

import { useState, type CSSProperties } from "react";
import { team } from "@/lib/teams";

/** A team's logo plus its NBA-standard abbreviation (or full name when showName).
 * The logo falls back to just the text if the image fails, mirroring Headshot. */
export default function TeamBadge({
  code,
  logoSize = 14,
  showName = false,
  className = "",
  style,
}: {
  code: string | null | undefined;
  logoSize?: number;
  showName?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const t = team(code);
  if (!t) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      style={style}
      title={showName ? undefined : t.name}
    >
      {t.logo && !logoFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={t.logo}
          alt=""
          width={logoSize}
          height={logoSize}
          onError={() => setLogoFailed(true)}
          className="object-contain"
          style={{ width: logoSize, height: logoSize }}
        />
      )}
      <span className="num">{showName ? t.name : t.abbr}</span>
    </span>
  );
}
