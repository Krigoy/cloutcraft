"use client";

import { createTimeline, stagger, utils, type Timeline } from "animejs";
import { PinnedScene } from "./pinned";
import { PretextText } from "./pretext-text";
import { cn } from "@/lib/utils";

/**
 * The three pinned scenes of the intro. Each `build` receives the sticky
 * stage and returns a timeline whose 0 → 100% is driven by scroll position.
 * Positions below are in timeline units (ms-like); the total length only
 * sets proportions, the scroll distance comes from `scrollVh`.
 */

const WORD_IN = { opacity: 1, translateY: "0em", scale: 1 } as const;

function hideWords(nodes: NodeListOf<Element> | Element[]) {
  utils.set(nodes, { opacity: 0, translateY: "0.55em", scale: 0.96 });
}

function revealWords(tl: Timeline, nodes: NodeListOf<Element> | Element[], at: number, duration = 900, step = 55) {
  tl.add(nodes, { ...WORD_IN, duration, delay: stagger(step), ease: "outCubic" }, at);
}

/* ------------------------------------------------------------------ Act 1 */

export function ActProblem() {
  return (
    <PinnedScene
      waitFor={2}
      build={(stage) => {
        const title = stage.querySelector<HTMLElement>(".act-title")!;
        const titleWords = title.querySelectorAll("[data-word]");
        const subWords = stage.querySelectorAll(".act-sub [data-word]");
        const ghosts = stage.querySelectorAll(".act-ghost");

        hideWords(titleWords);
        hideWords(subWords);
        utils.set(ghosts, { opacity: 0, translateY: -80 });

        const tl = createTimeline({ defaults: { ease: "inOutQuad" } });
        revealWords(tl, titleWords, 0, 1000, 70);
        tl.add(ghosts, { opacity: 0.09, duration: 900, delay: stagger(150) }, 200)
          .add(ghosts, { translateY: 140, duration: 3200, ease: "linear" }, 0)
          .add(ghosts, { opacity: 0, duration: 700 }, 2500)
          .add(title, { opacity: 0, scale: 0.94, translateY: -24, duration: 800 }, 2300);
        revealWords(tl, subWords, 2700, 800, 80);
        tl.add({ duration: 500 }); // hold the last frame before the scene releases
        return tl;
      }}
    >
      {(ready) => (
        <div className="relative w-full max-w-4xl text-center">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 select-none">
            {["$0.08", "4.2M", "$2.30", "×1.6", "54%"].map((g, i) => (
              <span
                key={g}
                className="act-ghost absolute text-6xl font-semibold tracking-tight text-foreground sm:text-8xl"
                style={{ left: `${8 + i * 19}%`, top: `${10 + ((i * 37) % 60)}%` }}
              >
                {g}
              </span>
            ))}
          </div>
          <PretextText
            as="h2"
            text="Three platforms. Three dashboards. No idea what a single video actually earned."
            className="act-title text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-7xl"
            words
            animate={false}
            onReady={ready}
          />
          <PretextText
            text="Views, subs, Bits, RPMs, qualified views… the numbers exist. They just never sit next to each other."
            className="act-sub absolute inset-x-0 top-1/2 mx-auto max-w-2xl -translate-y-1/2 text-xl text-muted-foreground sm:text-2xl"
            words
            animate={false}
            onReady={ready}
          />
        </div>
      )}
    </PinnedScene>
  );
}

/* ------------------------------------------------------------------ Act 2 */

const BASIS = [
  { label: "Reported", tone: "bg-good" },
  { label: "Calibrated", tone: "bg-src-ads" },
  { label: "Estimated", tone: "bg-src-rewards" },
];

export function ActRange() {
  return (
    <PinnedScene
      waitFor={1}
      build={(stage) => {
        const titleWords = stage.querySelectorAll(".act-title [data-word]");
        const band = stage.querySelector<HTMLElement>(".range-band")!;
        const low = stage.querySelector<HTMLElement>(".range-low")!;
        const high = stage.querySelector<HTMLElement>(".range-high")!;
        const mid = stage.querySelector<HTMLElement>(".range-mid")!;
        const chips = stage.querySelectorAll(".basis-chip");
        const caption = stage.querySelector<HTMLElement>(".range-caption")!;

        hideWords(titleWords);
        utils.set(band, { scaleX: 0 });
        utils.set(low, { opacity: 0, translateX: 40 });
        utils.set(high, { opacity: 0, translateX: -40 });
        utils.set(mid, { opacity: 0, scale: 0.9 });
        utils.set(chips, { opacity: 0, translateY: 16, scale: 0.9 });
        utils.set(caption, { opacity: 0 });

        const counter = { v: 0 };
        const tl = createTimeline({ defaults: { ease: "inOutQuad" } });
        revealWords(tl, titleWords, 0, 900, 60);
        tl.add(mid, { opacity: 1, scale: 1, duration: 500 }, 500)
          .add(counter, {
            v: 9557,
            duration: 1600,
            ease: "outQuad",
            onUpdate: () => {
              mid.textContent = `$${Math.round(counter.v).toLocaleString("en-US")}`;
            },
          }, 600)
          .add(band, { scaleX: 1, duration: 1400, ease: "inOutCubic" }, 1200)
          .add(low, { opacity: 1, translateX: 0, duration: 700 }, 1900)
          .add(high, { opacity: 1, translateX: 0, duration: 700 }, 1900)
          .add(chips, { opacity: 1, translateY: 0, scale: 1, duration: 600, delay: stagger(140) }, 2600)
          .add(caption, { opacity: 1, duration: 600 }, 3000)
          .add({ duration: 600 });
        return tl;
      }}
    >
      {(ready) => (
        <div className="w-full max-w-3xl text-center">
          <PretextText
            as="h2"
            text="Not a number. A range you can trust."
            className="act-title text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl"
            words
            animate={false}
            onReady={ready}
          />
          <div className="mt-12 sm:mt-16">
            <div className="range-mid text-6xl font-semibold tracking-tight tabular-nums sm:text-8xl">$0</div>
            <div className="relative mx-auto mt-8 h-2 w-full max-w-xl rounded-full bg-muted">
              <div className="range-band absolute inset-y-0 left-[12%] right-[10%] origin-center rounded-full bg-gradient-to-r from-twitch via-youtube to-src-rewards" />
              <span className="range-low absolute top-5 left-0 text-sm text-muted-foreground tabular-nums sm:text-base">
                low <span className="font-medium text-foreground">$8,977</span>
              </span>
              <span className="range-high absolute top-5 right-0 text-sm text-muted-foreground tabular-nums sm:text-base">
                high <span className="font-medium text-foreground">$11,352</span>
              </span>
            </div>
            <div className="mt-16 flex flex-wrap items-center justify-center gap-2">
              {BASIS.map((b) => (
                <span key={b.label} className="basis-chip inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm">
                  <span className={cn("size-2 rounded-full", b.tone)} />
                  {b.label}
                </span>
              ))}
            </div>
            <p className="range-caption mx-auto mt-5 max-w-lg text-sm text-muted-foreground">
              Every figure says how it was arrived at: reported by the platform, calibrated to a reported total, or modelled from counts and payout rates you can edit.
            </p>
          </div>
        </div>
      )}
    </PinnedScene>
  );
}

/* ------------------------------------------------------------------ Act 3 */

const FINDINGS = [
  { id: "F2", tone: "bg-youtube", title: "Shorts are 54% of output but 4% of earnings", kind: "Opportunity" },
  { id: "F4", tone: "bg-tiktok", title: "Tuesday Shorts get 1.5× the median views", kind: "Opportunity" },
  { id: "F7", tone: "bg-twitch", title: "66% of Twitch income is subs and Bits", kind: "Context" },
];

export function ActPlan() {
  return (
    <PinnedScene
      waitFor={1}
      scrollVh={320}
      build={(stage) => {
        const titleWords = stage.querySelectorAll(".act-title [data-word]");
        const cards = Array.from(stage.querySelectorAll<HTMLElement>(".deck-card"));
        const plan = stage.querySelector<HTMLElement>(".plan-card")!;
        const planRows = plan.querySelectorAll(".plan-row");
        const spread = Math.min(240, stage.clientWidth * 0.26);

        hideWords(titleWords);
        utils.set(cards, { opacity: 0, translateY: 180, rotate: 0 });
        utils.set(plan, { opacity: 0, translateY: 160, scale: 0.96 });
        utils.set(planRows, { opacity: 0, translateX: -12 });

        const tl = createTimeline({ defaults: { ease: "inOutQuad" } });
        revealWords(tl, titleWords, 0, 900, 60);
        cards.forEach((card, i) => {
          const k = i - 1; // -1, 0, 1
          tl.add(card, { opacity: 1, translateY: 0, translateX: k * spread, rotate: k * 6, duration: 900, ease: "outCubic" }, 500 + i * 220);
        });
        tl.add(cards, { translateY: 28, scale: 0.88, opacity: 0.3, duration: 900 }, 2200)
          .add(plan, { opacity: 1, translateY: 0, scale: 1, duration: 900, ease: "outCubic" }, 2400)
          .add(planRows, { opacity: 1, translateX: 0, duration: 500, delay: stagger(140) }, 2900)
          .add({ duration: 600 });
        return tl;
      }}
    >
      {(ready) => (
        <div className="w-full max-w-4xl text-center">
          <PretextText
            as="h2"
            text="Findings become this week's plan."
            className="act-title text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl"
            words
            animate={false}
            onReady={ready}
          />
          <div className="relative mx-auto mt-10 h-72 w-full sm:h-80">
            {FINDINGS.map((f) => (
              <div key={f.id} className="absolute inset-x-0 top-0 flex justify-center">
                <article className="deck-card w-64 rounded-2xl border bg-card p-4 text-left shadow-xl shadow-black/20">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded border px-1.5 font-mono text-[10px]">{f.id}</span>
                    <span className={cn("size-1.5 rounded-full", f.tone)} />
                    {f.kind}
                  </div>
                  <p className="mt-2 text-sm font-medium">{f.title}</p>
                </article>
              </div>
            ))}
            <div className="absolute inset-x-0 top-16 flex justify-center">
              <article className="plan-card w-full max-w-md rounded-2xl border bg-foreground p-5 text-left text-background shadow-2xl">
                <div className="text-xs text-background/60">Growth plan · this week</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {[
                    ["High", "Stretch the three strongest Shorts formats past 60 s", "F2 · F3"],
                    ["High", "Move long-form uploads to Tuesday for four weeks", "F4"],
                    ["Medium", "Add a sub-goal segment to Saturday streams", "F7"],
                  ].map(([p, action, ev]) => (
                    <li key={action} className="plan-row flex items-start gap-3">
                      <span className="mt-0.5 rounded-full bg-background/15 px-2 py-0.5 text-[10px] font-medium uppercase">{p}</span>
                      <span className="flex-1">{action}</span>
                      <span className="font-mono text-[10px] text-background/60">{ev}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </div>
        </div>
      )}
    </PinnedScene>
  );
}
