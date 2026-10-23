"use client";

import { animate, stagger, type JSAnimation } from "animejs";
import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "./reduced-motion";

/**
 * Staggered entrance for every descendant marked `data-reveal`, in document
 * order — including nodes that appear later (e.g. a plan rendered after a
 * server action), which a MutationObserver picks up and animates as a batch.
 *
 * Elements are pre-hidden by CSS only when JavaScript is running
 * (`html.js [data-reveal]`), and that rule carries its own 1.5 s safety
 * animation back to full opacity, so content can never stay invisible if
 * this effect is slow or fails.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = prefersReducedMotion();
    const animations = new Set<JSAnimation>();

    const show = (nodes: HTMLElement[]) => {
      for (const n of nodes) {
        n.style.opacity = "1";
        n.style.transform = "";
      }
    };

    const run = (nodes: HTMLElement[]) => {
      const fresh = nodes.filter((n) => !n.dataset.revealed);
      if (fresh.length === 0) return;
      for (const n of fresh) n.dataset.revealed = "1";
      if (reduced) {
        show(fresh);
        return;
      }
      const animation = animate(fresh, {
        opacity: [0, 1],
        translateY: [14, 0],
        duration: 640,
        delay: stagger(45, { start: 40 }),
        ease: "outQuint",
        onComplete: () => {
          show(fresh);
          animations.delete(animation);
        },
      });
      animations.add(animation);
    };

    const collect = (scope: ParentNode | Element): HTMLElement[] => {
      const found = Array.from(scope.querySelectorAll<HTMLElement>("[data-reveal]"));
      if (scope instanceof HTMLElement && scope.matches("[data-reveal]")) found.unshift(scope);
      return found;
    };

    run(collect(root));

    // Batch additions that land in the same frame so they stagger together.
    let pending: HTMLElement[] = [];
    let frame = 0;
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node instanceof HTMLElement) pending.push(...collect(node));
        }
      }
      if (pending.length && !frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          const batch = pending;
          pending = [];
          run(batch);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const a of animations) a.cancel();
      show(collect(root));
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
