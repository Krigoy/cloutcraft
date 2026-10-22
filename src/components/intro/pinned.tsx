"use client";

import { onScroll, type ScrollObserver, type Timeline } from "animejs";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/components/motion/reduced-motion";
import { cn } from "@/lib/utils";

/**
 * A scene that pins to the viewport while the page keeps scrolling. The
 * wrapper is `scrollVh` tall; the stage inside is sticky, so for that whole
 * scroll distance the viewer sees one frame-filling stage while a timeline is
 * scrubbed from 0 → 100% by scroll position (`onScroll({ sync })`).
 *
 * `build` receives the stage and returns the timeline. It is only invoked once
 * every Pretext block inside has reported ready (`waitFor` = how many), so the
 * word/line nodes exist by the time the timeline targets them.
 */
export function PinnedScene({
  scrollVh = 300,
  waitFor = 0,
  build,
  className,
  stageClassName,
  children,
}: {
  scrollVh?: number;
  waitFor?: number;
  build: (stage: HTMLElement) => Timeline;
  className?: string;
  stageClassName?: string;
  children: (notifyReady: () => void) => ReactNode;
}) {
  const wrapper = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [readyCount, setReadyCount] = useState(0);
  const notifyReady = useCallback(() => setReadyCount((n) => n + 1), []);
  const buildRef = useRef(build);
  useLayoutEffect(() => {
    buildRef.current = build;
  });

  useLayoutEffect(() => {
    const section = wrapper.current;
    const el = stage.current;
    if (!section || !el || readyCount < waitFor || prefersReducedMotion()) return;

    const observer: ScrollObserver = onScroll({
      target: section,
      enter: { container: "top", target: "top" },
      leave: { container: "bottom", target: "bottom" },
      sync: 0.35, // smooth the scrub slightly so fast wheels don't feel steppy
    });
    const timeline = buildRef.current(el);
    timeline.pause();
    observer.link(timeline);

    return () => {
      observer.revert();
      timeline.revert();
    };
  }, [readyCount, waitFor]);

  return (
    <section ref={wrapper} className={cn("relative", className)} style={{ height: `${scrollVh}vh` }}>
      <div
        ref={stage}
        className={cn(
          "sticky top-14 flex h-[calc(100vh-3.5rem)] items-center justify-center overflow-hidden",
          stageClassName,
        )}
      >
        {children(notifyReady)}
      </div>
    </section>
  );
}
