"use client";

import { animate } from "animejs";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "./reduced-motion";

/** A horizontal share bar that grows into place on mount. */
export function Meter({
  share,
  colorClass,
  delay = 0,
  label,
}: {
  /** 0–1 */
  share: number;
  colorClass: string;
  delay?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const target = `${Math.max(2, Math.min(100, share * 100)).toFixed(1)}%`;

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const animation = animate(el, {
      width: ["0%", target],
      duration: 900,
      delay: 180 + delay,
      ease: "outQuart",
    });
    return () => {
      animation.cancel();
      el.style.width = target;
    };
  }, [target, delay]);

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
    >
      <div ref={ref} className={cn("h-full rounded-full", colorClass)} style={{ width: target }} />
    </div>
  );
}
