"use client";

import { layoutWithLines, prepareWithSegments, type PreparedTextWithSegments } from "@chenglou/pretext";
import { animate, onScroll, stagger, utils } from "animejs";
import { useLayoutEffect, useRef, useState, type ElementType } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "@/components/motion/reduced-motion";

/**
 * Text laid out by Pretext instead of the browser.
 *
 * The paragraph is measured off-DOM with the element's own computed font and
 * broken into lines at the element's width; each line is rendered as its own
 * block (and, with `words`, each word as an inline block) so they can be
 * animated individually. On resize only the cheap `layoutWithLines()`
 * arithmetic reruns. The server renders the plain paragraph, so the text is
 * always present for crawlers and no-JS readers.
 *
 * Two modes:
 *  - self-animating (default): lines rise in on mount or when scrolled into view;
 *  - controlled (`animate={false}`): nothing animates here; `onReady` fires
 *    once the line/word nodes exist so a parent timeline can drive them.
 */
export function PretextText({
  text,
  as = "p",
  className,
  lineClassName,
  words = false,
  animate: selfAnimate = true,
  onReady,
  delay = 0,
  revealOnScroll = false,
  from = "0.7em",
}: {
  text: string;
  as?: ElementType;
  className?: string;
  lineClassName?: string;
  /** Wrap each word in `span[data-word]` for word-level animation. */
  words?: boolean;
  /** Set false to let a parent animate the `[data-line]` / `[data-word]` nodes. */
  animate?: boolean;
  /** Called (once) when the laid-out nodes exist; only used with `animate={false}`. */
  onReady?: (element: HTMLElement) => void;
  /** ms before the first line starts animating. */
  delay?: number;
  /** Start when the element scrolls into view instead of on mount. */
  revealOnScroll?: boolean;
  /** Vertical offset lines rise from. */
  from?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const started = useRef(false);
  const onReadyRef = useRef(onReady);
  useLayoutEffect(() => {
    onReadyRef.current = onReady;
  });

  /* Measure with Pretext and split into lines once fonts are ready; re-run on resize. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let prepared: PreparedTextWithSegments | null = null;
    let font = "";

    const measure = () => {
      const style = getComputedStyle(el);
      const nextFont = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if (!prepared || nextFont !== font) {
        font = nextFont;
        prepared = prepareWithSegments(text, nextFont, { letterSpacing: Number.parseFloat(style.letterSpacing) || 0 });
      }
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
      const width = el.clientWidth;
      if (!width) return;
      const next = layoutWithLines(prepared, width, lineHeight).lines.map((l) => l.text);
      // Keep state identity stable when nothing changed so effects don't re-run.
      setLines((prev) => (prev && prev.length === next.length && prev.every((l, i) => l === next[i]) ? prev : next));
    };

    let cancelled = false;
    const observer = new ResizeObserver(() => measure());
    const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();
    fontsReady
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        measure();
        observer.observe(el);
      });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text]);

  /* First time the nodes exist: animate them, or hand them to the parent. */
  const ready = lines !== null;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ready || started.current) return;
    started.current = true;

    if (!selfAnimate) {
      onReadyRef.current?.(el);
      return;
    }
    if (prefersReducedMotion()) return;
    const targets = el.querySelectorAll<HTMLElement>("[data-line]");
    if (targets.length === 0) return;
    utils.set(targets, { opacity: 0 });
    const animation = animate(targets, {
      opacity: [0, 1],
      translateY: [from, "0em"],
      delay: stagger(90, { start: delay }),
      duration: 1000,
      ease: "outQuint",
      autoplay: revealOnScroll ? onScroll({ target: el, enter: { container: "85%", target: "top" } }) : true,
    });
    return () => {
      animation.cancel();
      utils.set(targets, { opacity: 1, translateY: 0 });
    };
  }, [ready, selfAnimate, delay, revealOnScroll, from]);

  const Tag = as;
  return (
    <Tag
      ref={ref}
      className={cn("block", !lines && "pretext-pending", className)}
      aria-label={lines ? text : undefined}
    >
      {lines
        ? lines.map((line, i) => (
            // Index keys keep the same nodes across re-layouts, so a resize
            // after the entrance never resets a line's opacity.
            <span key={i} data-line aria-hidden className={cn("block whitespace-pre", lineClassName)}>
              {words
                ? line.split(" ").map((word, j, arr) => (
                    <span key={j} className="inline-block will-change-transform" data-word>
                      {word}
                      {j < arr.length - 1 ? " " : ""}
                    </span>
                  ))
                : line}
            </span>
          ))
        : text}
    </Tag>
  );
}
