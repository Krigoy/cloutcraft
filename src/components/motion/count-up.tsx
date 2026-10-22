"use client";

import { measureNaturalWidth, prepare, type PreparedText } from "@chenglou/pretext";
import { animate } from "animejs";
import { useEffect, useMemo, useRef } from "react";
import { formatCompact, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "./reduced-motion";

export type CountFormat = "int" | "compact" | "usd" | "usd-precise" | "signed-compact";

export interface FitOptions {
  /** Largest font size in px (the server-rendered size). */
  max: number;
  /** Smallest font size the figure may shrink to. */
  min: number;
}

function fmt(format: CountFormat, value: number): string {
  switch (format) {
    case "usd":
      return formatUsd(value);
    case "usd-precise":
      return formatUsd(value, true);
    case "compact":
      return formatCompact(value);
    case "signed-compact":
      return `${value >= 0 ? "+" : "−"}${formatCompact(Math.abs(value))}`;
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

/**
 * A number that counts up from zero on mount. Server-rendered with the final
 * value, so it is correct without JavaScript and never shifts layout.
 *
 * With `fit`, the figure is sized to its parent's width using Pretext: the
 * text is measured once off-DOM (no reflow) and only the cheap arithmetic
 * reruns on resize.
 */
export function CountUp({
  value,
  format = "int",
  duration = 900,
  className,
  fit,
}: {
  value: number;
  format?: CountFormat;
  duration?: number;
  className?: string;
  fit?: FitOptions;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const formatted = useMemo(() => fmt(format, value), [format, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || value === 0) {
      el.textContent = formatted;
      return;
    }
    const counter = { v: 0 };
    const animation = animate(counter, {
      v: value,
      duration,
      ease: "outExpo",
      onUpdate: () => {
        el.textContent = fmt(format, counter.v);
      },
      onComplete: () => {
        el.textContent = formatted;
      },
    });
    return () => {
      animation.cancel();
      el.textContent = formatted;
    };
  }, [value, format, duration, formatted]);

  useEffect(() => {
    if (!fit) return;
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    const style = getComputedStyle(el);
    const letterSpacing = Number.parseFloat(style.letterSpacing) || 0;
    let prepared: PreparedText | null = null;

    const apply = () => {
      const available = parent.clientWidth;
      if (!available) return;
      // Measure at the largest size; width scales linearly with font size.
      prepared ??= prepare(formatted, `${style.fontWeight} ${fit.max}px ${style.fontFamily}`, { letterSpacing });
      const natural = measureNaturalWidth(prepared);
      const size = natural > 0 ? Math.max(fit.min, Math.min(fit.max, (fit.max * available) / natural)) : fit.max;
      el.style.fontSize = `${size.toFixed(2)}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fit, formatted]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)} style={fit ? { fontSize: fit.max } : undefined}>
      {formatted}
    </span>
  );
}
