"use client";

import { animate, stagger } from "animejs";
import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "./reduced-motion";

/**
 * Staggered entrance for every descendant marked `data-reveal`, in document
 * order. Elements are pre-hidden by CSS only when JavaScript is running
 * (`html.js [data-reveal]`), and that rule carries its own 1.5 s safety
 * animation back to full opacity, so content can never stay invisible if
 * this effect is slow or fails.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (nodes.length === 0) return;

    const show = () => {
      for (const n of nodes) {
        n.style.opacity = "1";
        n.style.transform = "";
      }
    };
    if (prefersReducedMotion()) {
      show();
      return;
    }

    const animation = animate(nodes, {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 640,
      delay: stagger(45, { start: 40 }),
      ease: "outQuint",
      onComplete: show,
    });
    return () => {
      animation.cancel();
      show();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
