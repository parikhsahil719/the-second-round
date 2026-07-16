"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GLOSSARY } from "@/lib/glossary";

const OPEN_DELAY = 150;
const CLOSE_DELAY = 120;
const GAP = 6; // px between trigger and panel
const MARGIN = 8; // viewport edge margin
const MAX_W = 280;

/**
 * An inline defined term: a dotted-underlined word that reveals its plain-English
 * definition in a popover on hover, focus, or tap. `id` is a GLOSSARY key.
 *
 * MUST render outside any ancestor <a>/<Link>: it is a <button>, and a button inside
 * an anchor is invalid HTML that hijacks the link. See the design spec's hard constraint.
 */
export default function Term({
  id,
  children,
  note,
}: {
  id: string;
  children?: ReactNode;
  // per-use override of the glossary short text, for entries whose popover
  // carries instance data (e.g. which team traded this particular pick)
  note?: string;
}) {
  const entry = GLOSSARY[id];
  const panelId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const pointerType = useRef<string>("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const panel = panelRef.current;
    const btn = btnRef.current;
    if (!panel || !btn) return;

    const place = () => {
      const r = btn.getBoundingClientRect();
      const pr = panel.getBoundingClientRect();
      const pw = pr.width || MAX_W;
      const ph = pr.height || 0;
      let left = Math.min(r.left, window.innerWidth - pw - MARGIN);
      left = Math.max(MARGIN, left);
      const spaceBelow = window.innerHeight - r.bottom;
      let top = spaceBelow < ph + MARGIN && r.top > spaceBelow ? r.top - ph - GAP : r.bottom + GAP;
      top = Math.max(MARGIN, Math.min(top, window.innerHeight - ph - MARGIN));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const onToggle = (e: Event) => {
      const open = (e as Event & { newState?: string }).newState === "open";
      setExpanded(open);
      if (open) {
        place();
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
      } else {
        window.removeEventListener("scroll", place, true);
        window.removeEventListener("resize", place);
      }
    };

    panel.addEventListener("beforetoggle", onToggle);
    panel.addEventListener("toggle", onToggle);
    return () => {
      panel.removeEventListener("beforetoggle", onToggle);
      panel.removeEventListener("toggle", onToggle);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []);

  // Defensive: a bad key never crashes a page, it just renders as plain text.
  if (!entry) return <>{children ?? id}</>;

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };
  const isOpen = () => panelRef.current?.matches(":popover-open") ?? false;
  const open = () => {
    clearTimers();
    if (!isOpen()) panelRef.current?.showPopover();
  };
  const close = () => {
    clearTimers();
    if (isOpen()) panelRef.current?.hidePopover();
  };
  const scheduleOpen = () => {
    clearTimers();
    openTimer.current = window.setTimeout(open, OPEN_DELAY);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(close, CLOSE_DELAY);
  };
  const mouse = (e: ReactPointerEvent) => e.pointerType === "mouse";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="term"
        aria-expanded={expanded}
        aria-details={panelId}
        onPointerDown={(e) => {
          pointerType.current = e.pointerType;
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Mouse is handled by hover; only tap and keyboard toggle on click.
          if (pointerType.current !== "mouse") (isOpen() ? close() : open());
        }}
        onPointerEnter={(e) => mouse(e) && scheduleOpen()}
        onPointerLeave={(e) => mouse(e) && scheduleClose()}
        onFocus={open}
        onBlur={(e) => {
          const to = e.relatedTarget as Node | null;
          if (!panelRef.current?.contains(to) && !btnRef.current?.contains(to)) scheduleClose();
        }}
      >
        {children ?? entry.term}
      </button>
      {/* popover="auto": top layer (never clipped), free Esc + light-dismiss.
          A <span> (not <div>) so it is valid phrasing content inside a <p>. */}
      <span
        ref={panelRef}
        id={panelId}
        popover="auto"
        className="term-pop"
        onPointerEnter={(e) => mouse(e) && clearTimers()}
        onPointerLeave={(e) => mouse(e) && scheduleClose()}
      >
        <span>{note ?? entry.short}</span>{" "}
        <Link href={`/glossary#${id}`} className="link">
          Full glossary →
        </Link>
      </span>
    </>
  );
}
