"use client";

import { animate, createScope, createTimeline, onScroll, stagger, svg, utils } from "animejs";
import { ArrowDown, ArrowRight, BarChart3, Radio, Sparkles, Waypoints } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ActPlan, ActProblem, ActRange } from "./acts";
import { PretextText } from "./pretext-text";

/**
 * Landing page. Every animation lives inside one anime.js scope rooted at the
 * page so it is reverted cleanly on unmount, and the whole scope is skipped
 * when the OS asks for reduced motion.
 *
 *  - entrance: hero timeline + Pretext line reveals
 *  - ambient: drifting colour orbs
 *  - scroll: parallax layers (`data-parallax` speed), reveal-on-enter
 *    (`data-scroll-reveal`), scrubbed path drawing and a tilting mock-up
 */

const FEATURES = [
  {
    icon: BarChart3,
    title: "Earnings as honest ranges",
    body: "Every video, Short and stream gets a low–mid–high estimate, labelled reported, calibrated or modelled — never a single made-up number.",
    tone: "bg-youtube",
  },
  {
    icon: Radio,
    title: "Views that move",
    body: "Scheduled syncs keep a history of every item, so you see new views in the last 24 hours and the scheduler samples live viewers while you stream.",
    tone: "bg-twitch",
  },
  {
    icon: Waypoints,
    title: "Findings, not vibes",
    body: "Best weekday per format, duration sweet spots, cadence gaps, hidden gems — computed from your own data and numbered so they can be cited.",
    tone: "bg-tiktok",
  },
  {
    icon: Sparkles,
    title: "A coach that shows its work",
    body: "An LLM turns the findings into a prioritised plan: concrete actions, expected impact and the finding IDs behind each one.",
    tone: "bg-src-rewards",
  },
] as const;

const STEPS = [
  { title: "Connect", body: "Read-only OAuth to YouTube, Twitch and TikTok. Tokens are encrypted at rest; nothing is posted on your behalf." },
  { title: "Sync", body: "Content, stats and channel signals are pulled every few hours and stored locally in SQLite." },
  { title: "Estimate", body: "Published payout rates — editable by you — turn counts into ranges, calibrated to anything a platform reports." },
  { title: "Grow", body: "Insights surface patterns; the coach turns them into this week's plan." },
] as const;

const COUNTERS = [
  { value: 3, label: "platforms, one dashboard" },
  { value: 180, label: "days of history per sync" },
  { value: 24, label: "hour view velocity" },
  { value: 1, label: "plan that cites its evidence" },
] as const;

export function IntroPage({
  signedIn,
  hasConnections,
  demoInstalled,
}: {
  signedIn: boolean;
  hasConnections: boolean;
  demoInstalled: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const scope = createScope({ root, mediaQueries: { reduce: "(prefers-reduced-motion: reduce)" } }).add((self) => {
      if (self?.matches.reduce) return;
      const $ = <T extends Element = HTMLElement>(sel: string) => Array.from(el.querySelectorAll<T>(sel));

      /* Hero entrance */
      const heroBits = [...$(".intro-eyebrow"), ...$(".intro-cta > *"), ...$(".intro-hint")];
      utils.set(heroBits, { opacity: 0 });
      createTimeline({ defaults: { ease: "outQuint", duration: 700 } })
        .add(".intro-eyebrow", { opacity: [0, 1], translateY: [10, 0] }, 100)
        .add(".intro-cta > *", { opacity: [0, 1], translateY: [14, 0], delay: stagger(90) }, 900)
        .add(".intro-hint", { opacity: [0, 1] }, 1500);

      /* Ambient orbs */
      animate(".intro-orb", {
        translateX: () => utils.random(-60, 60),
        translateY: () => utils.random(-40, 40),
        scale: () => utils.random(0.9, 1.15, 2),
        duration: () => utils.random(7000, 11000),
        ease: "inOutSine",
        loop: true,
        alternate: true,
        delay: stagger(400),
      });
      animate(".intro-hint svg", { translateY: [0, 6], duration: 900, ease: "inOutSine", loop: true, alternate: true });

      /* Parallax: each layer moves between +speed·120px and −speed·120px while its section crosses the viewport */
      for (const layer of $("[data-parallax]")) {
        const speed = Number(layer.dataset.parallax ?? 0.3);
        const section = layer.closest("section") ?? layer;
        animate(layer, {
          translateY: [speed * 120, speed * -120],
          ease: "linear",
          autoplay: onScroll({
            target: section,
            enter: { container: "bottom", target: "top" },
            leave: { container: "top", target: "bottom" },
            sync: true,
          }),
        });
      }

      /* Reveal on enter */
      const reveals = $("[data-scroll-reveal]");
      utils.set(reveals, { opacity: 0 });
      for (const item of reveals) {
        animate(item, {
          opacity: [0, 1],
          translateY: [36, 0],
          duration: 900,
          ease: "outQuint",
          autoplay: onScroll({ target: item, enter: { container: "88%", target: "top" } }),
        });
      }

      /* Feature cards stagger as a group */
      const features = $(".intro-feature");
      utils.set(features, { opacity: 0 });
      animate(features, {
        opacity: [0, 1],
        translateY: [48, 0],
        rotateX: [-8, 0],
        delay: stagger(110),
        duration: 1000,
        ease: "outQuint",
        autoplay: onScroll({ target: ".intro-features", enter: { container: "82%", target: "top" } }),
      });

      /* Steps: the connecting line draws as you scroll */
      const [path] = svg.createDrawable(".intro-path");
      if (path) {
        animate(path, {
          draw: ["0 0", "0 1"],
          ease: "linear",
          autoplay: onScroll({
            target: ".intro-steps",
            enter: { container: "75%", target: "top" },
            leave: { container: "45%", target: "bottom" },
            sync: true,
          }),
        });
      }

      /* Counters */
      for (const node of $("[data-count]")) {
        const target = Number(node.dataset.count ?? 0);
        const counter = { v: 0 };
        animate(counter, {
          v: target,
          duration: 1600,
          ease: "outExpo",
          onUpdate: () => {
            node.textContent = Math.round(counter.v).toLocaleString("en-US");
          },
          autoplay: onScroll({ target: node, enter: { container: "90%", target: "top" } }),
        });
      }

      /* Mock dashboard tilts into place */
      animate(".intro-mock", {
        rotateX: [16, 0],
        scale: [0.92, 1],
        opacity: [0.6, 1],
        ease: "linear",
        autoplay: onScroll({
          target: ".intro-mock",
          enter: { container: "bottom", target: "top" },
          leave: { container: "45%", target: "center" },
          sync: true,
        }),
      });
    });
    return () => scope.revert();
  }, []);

  // Signed out → sign up. Signed in → straight to the data, or to connecting it.
  const primary = !signedIn
    ? { href: "/sign-up", label: "Get started free" }
    : hasConnections
      ? { href: "/dashboard", label: "Open the dashboard" }
      : { href: "/settings", label: "Connect a platform" };

  return (
    <div ref={root} className="intro -mt-6 space-y-28 pb-24">
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative isolate overflow-hidden pt-24 pb-16 sm:pt-32">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span data-parallax="0.35" className="intro-orb absolute -top-24 left-[8%] size-72 rounded-full bg-twitch/35 blur-3xl" />
          <span data-parallax="0.2" className="intro-orb absolute top-10 right-[6%] size-80 rounded-full bg-youtube/30 blur-3xl" />
          <span data-parallax="0.5" className="intro-orb absolute -bottom-20 left-[38%] size-64 rounded-full bg-tiktok/30 blur-3xl" />
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <span className="intro-eyebrow inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-good" />
            For YouTube, Twitch and TikTok creators
          </span>
          <PretextText
            as="h1"
            text="See what every video, Short and stream really earns."
            className="mt-6 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl"
            delay={250}
          />
          <PretextText
            text="One dashboard that pulls your channels together, estimates income as honest ranges, tracks how views move, and turns the patterns into a plan you can act on this week."
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            delay={700}
            from="0.4em"
          />
          <div className="intro-cta mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={primary.href} className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
              {primary.label}
              <ArrowRight className="size-4" />
            </Link>
            {!signedIn ? (
              <Link href="/sign-in" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Sign in
              </Link>
            ) : demoInstalled ? (
              <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>
                View the demo
              </Link>
            ) : (
              <form action="/api/demo" method="post">
                <input type="hidden" name="action" value="install" />
                <Button type="submit" variant="outline" size="lg">
                  Explore with demo data
                </Button>
              </form>
            )}
          </div>
          <div className="intro-hint mt-16 flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <span>Scroll</span>
            <ArrowDown className="size-4" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Counters */}
      <section className="relative">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {COUNTERS.map((c) => (
            <div key={c.label} data-scroll-reveal className="rounded-xl border bg-card/70 p-5 text-center backdrop-blur">
              <dt className="order-2 mt-1 text-xs text-muted-foreground">{c.label}</dt>
              <dd className="text-4xl font-semibold tracking-tight tabular-nums">
                <span data-count={c.value}>0</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --------------------------------------------------- Pinned, scroll-driven scenes */}
      <ActProblem />
      <ActRange />
      <ActPlan />

      {/* ------------------------------------------------------------- Features */}
      <section className="intro-features relative" style={{ perspective: "1200px" }}>
        <div className="mb-10 max-w-2xl">
          <PretextText
            as="h2"
            text="Built for how creator income actually works."
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
            revealOnScroll
          />
          <PretextText
            text="Only YouTube reports revenue through its API. Twitch and TikTok expose counts, not payouts. So the numbers are modelled openly, with the assumptions one click away."
            className="mt-3 text-muted-foreground"
            revealOnScroll
            from="0.4em"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.title} className="intro-feature lift rounded-2xl border bg-card/80 p-6 backdrop-blur">
              <span className={cn("mb-4 inline-flex size-10 items-center justify-center rounded-xl text-white", f.tone)}>
                <f.icon className="size-5" />
              </span>
              <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ Showcase */}
      <section className="relative isolate overflow-hidden rounded-3xl border bg-card/40 px-6 py-16 sm:px-12" style={{ perspective: "1400px" }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span data-parallax="0.25" className="absolute -top-16 right-[10%] size-64 rounded-full bg-src-rewards/25 blur-3xl" />
          <span data-parallax="0.45" className="absolute -bottom-24 left-[5%] size-72 rounded-full bg-twitch/25 blur-3xl" />
        </div>
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <PretextText
              as="h2"
              text="Parallax-level clarity on where the money comes from."
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
              revealOnScroll
            />
            <PretextText
              text="Subs, Bits, ads and Creator Rewards are split per platform. Shorts that drive reach but not revenue are called out, and every estimate shows its band."
              className="mt-3 text-muted-foreground"
              revealOnScroll
              from="0.4em"
            />
            <ul className="mt-6 space-y-2 text-sm">
              {["Range, not a number", "Calibrated to reported revenue", "Editable payout assumptions"].map((t) => (
                <li key={t} data-scroll-reveal className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-foreground" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="intro-mock origin-top rounded-2xl border bg-background/90 p-5 shadow-2xl shadow-black/20 backdrop-blur" style={{ transformStyle: "preserve-3d" }}>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Estimated earnings · 90 days</span>
                <span className="rounded-full border px-2 py-0.5">Calibrated</span>
              </div>
              <div className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">$9,557</div>
              <div className="text-xs text-muted-foreground tabular-nums">$8,977 – $11,352</div>
              <div className="mt-6 flex h-28 items-end gap-2">
                {[38, 52, 46, 60, 55, 72, 64, 90, 58, 66, 48, 30].map((h, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col justify-end gap-0.5">
                    <div className="rounded-t-sm bg-tiktok" style={{ height: `${h * 0.12}%` }} />
                    <div className="bg-twitch" style={{ height: `${h * 0.3}%` }} />
                    <div className="bg-youtube" style={{ height: `${h * 0.58}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                {[
                  ["YouTube", "$5,622", "bg-youtube"],
                  ["Twitch", "$3,342", "bg-twitch"],
                  ["TikTok", "$594", "bg-tiktok"],
                ].map(([name, value, tone]) => (
                  <div key={name} className="rounded-lg border p-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className={cn("size-1.5 rounded-full", tone)} />
                      {name}
                    </div>
                    <div className="mt-1 font-semibold tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div data-parallax="-0.35" className="absolute -top-6 -right-3 rounded-xl border bg-card px-3 py-2 text-xs shadow-lg sm:-right-8">
              <span className="text-muted-foreground">New views · 24 h</span>
              <div className="font-semibold text-good tabular-nums">+171.8K</div>
            </div>
            <div data-parallax="0.3" className="absolute -bottom-6 -left-3 rounded-xl border bg-card px-3 py-2 text-xs shadow-lg sm:-left-8">
              <span className="text-muted-foreground">F2 · Opportunity</span>
              <div className="font-medium">Shorts are 54% of output, 4% of earnings</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- Steps */}
      <section className="intro-steps relative">
        <PretextText
          as="h2"
          text="From connect to plan in four steps."
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          revealOnScroll
        />
        <div className="relative mt-10 grid gap-8 pl-10 sm:pl-14">
          <svg aria-hidden className="absolute top-2 bottom-2 left-3 h-[calc(100%-1rem)] w-6 sm:left-5" viewBox="0 0 24 400" preserveAspectRatio="none" fill="none">
            <path d="M12 0 V400" stroke="var(--border)" strokeWidth="2" />
            <path className="intro-path" d="M12 0 V400" stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {STEPS.map((s, i) => (
            <div key={s.title} data-scroll-reveal className="relative">
              <span className="absolute top-1 -left-10 flex size-6 items-center justify-center rounded-full border bg-background text-[11px] font-semibold sm:-left-14 sm:size-7">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="relative isolate overflow-hidden rounded-3xl border bg-foreground px-6 py-16 text-center text-background sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-60">
          <span data-parallax="0.3" className="absolute -top-20 left-[15%] size-64 rounded-full bg-twitch blur-3xl" />
          <span data-parallax="0.15" className="absolute -right-10 -bottom-24 size-72 rounded-full bg-youtube blur-3xl" />
        </div>
        <PretextText
          as="h2"
          text="Your numbers, your assumptions, your plan."
          className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl"
          revealOnScroll
        />
        <p data-scroll-reveal className="mx-auto mt-4 max-w-xl text-sm text-background/70 sm:text-base">
          Self-hosted, read-only access, tokens encrypted at rest. The only thing sent to an AI is a summary of your analytics — never a credential.
        </p>
        <div data-scroll-reveal className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={primary.href} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "gap-2")}>
            {primary.label}
            <ArrowRight className="size-4" />
          </Link>
          <Link href="/settings" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "text-background hover:bg-background/10 hover:text-background")}>
            See the assumptions
          </Link>
        </div>
      </section>
    </div>
  );
}
