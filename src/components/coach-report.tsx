import { AlertTriangle, Check, FlaskConical, Gauge, ListChecks, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { startExperimentAction } from "@/app/coach/experiments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CoachReport, Experiment, Recommendation } from "@/lib/ai/schema";
import { describeSegment } from "@/lib/experiments/score";
import { cn } from "@/lib/utils";

/** Hidden fields that let `startExperimentAction` recreate the coach's tracking spec. */
function TrackFields({ x, index, runId, windowDays }: { x: Experiment; index: number; runId: number; windowDays: number }) {
  const t = x.tracking;
  return (
    <>
      <input type="hidden" name="window" value={windowDays} />
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="index" value={index} />
      <input type="hidden" name="title" value={x.hypothesis} />
      <input type="hidden" name="method" value={x.method} />
      <input type="hidden" name="successMetric" value={x.successMetric} />
      <input type="hidden" name="durationWeeks" value={x.durationWeeks} />
      <input type="hidden" name="metric" value={t.metric} />
      <input type="hidden" name="targetLift" value={t.targetLift} />
      {t.platform && <input type="hidden" name="platform" value={t.platform} />}
      {t.kind && <input type="hidden" name="kind" value={t.kind} />}
      {t.weekdays?.length ? <input type="hidden" name="weekdays" value={t.weekdays.join(",")} /> : null}
      {t.minDurationSec !== null && <input type="hidden" name="minDurationSec" value={t.minDurationSec} />}
      {t.maxDurationSec !== null && <input type="hidden" name="maxDurationSec" value={t.maxDurationSec} />}
    </>
  );
}

/** Segment chips for an experiment that carries a tracking spec (older plans don't). */
function trackingSegment(x: Experiment) {
  const t = x.tracking;
  if (!t) return null;
  return {
    platform: t.platform ?? undefined,
    kind: t.kind ?? undefined,
    weekdays: t.weekdays ?? undefined,
    minDurationSec: t.minDurationSec ?? undefined,
    maxDurationSec: t.maxDurationSec ?? undefined,
  };
}

const CATEGORY_LABEL: Record<Recommendation["category"], string> = {
  content_strategy: "Content strategy",
  format_mix: "Format mix",
  cadence: "Cadence",
  timing: "Timing",
  monetization: "Monetization",
  audience: "Audience",
  cross_platform: "Cross-platform",
};

const PRIORITY: Record<Recommendation["priority"], { label: string; bar: string; badge: "default" | "secondary" | "outline" }> = {
  high: { label: "High priority", bar: "border-l-critical", badge: "default" },
  medium: { label: "Medium priority", bar: "border-l-warn", badge: "secondary" },
  low: { label: "Low priority", bar: "border-l-muted-foreground/40", badge: "outline" },
};

function SectionLabel({ icon: Icon, children }: { icon: typeof Target; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <Icon className="size-3.5" />
      {children}
    </div>
  );
}

export function CoachReportView({
  report,
  question,
  runId,
  windowDays,
  tracked,
}: {
  report: CoachReport;
  question?: string;
  /** With `windowDays`, enables the "Track" button on experiments. */
  runId?: number;
  windowDays?: number;
  /** Indices of this run's experiments that are already being tracked. */
  tracked?: ReadonlySet<number>;
}) {
  const answer = report.answer?.trim();
  const plan = report.thirtyDayPlan ?? [];
  const canTrack = runId !== undefined && windowDays !== undefined;

  return (
    <div className="space-y-6">
      {question && (
        <Card data-reveal className="relative isolate overflow-hidden border-foreground/15">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <span className="absolute -top-16 -left-10 size-56 rounded-full bg-twitch/25 blur-3xl" />
            <span className="absolute -right-10 -bottom-20 size-56 rounded-full bg-tiktok/20 blur-3xl" />
          </div>
          <CardHeader>
            <CardDescription>You asked</CardDescription>
            <CardTitle className="text-lg font-medium">“{question}”</CardTitle>
          </CardHeader>
          {answer && (
            <CardContent>
              <p className="max-w-3xl text-[15px] leading-relaxed">{answer}</p>
            </CardContent>
          )}
        </Card>
      )}

      <Card data-reveal>
        <CardHeader>
          <CardTitle>Where you stand</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-3xl text-sm leading-relaxed">{report.summary}</p>
          {report.strengths.length > 0 && (
            <div>
              <SectionLabel icon={Sparkles}>What’s working</SectionLabel>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {report.strengths.map((s) => (
                  <li key={s} className="rounded-lg border bg-background/60 px-3 py-2 text-sm">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Recommendations</h2>
        {report.recommendations.map((r, i) => {
          const p = PRIORITY[r.priority];
          return (
            <Card key={`${i}-${r.title}`} data-reveal className={cn("border-l-4", p.bar)}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <Badge variant={p.badge}>{p.label}</Badge>
                  <Badge variant="outline" className="font-normal">
                    {CATEGORY_LABEL[r.category]}
                  </Badge>
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    {r.effort} effort
                  </Badge>
                </div>
                <CardTitle className="text-xl tracking-tight">{r.title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">{r.rationale}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 text-sm lg:grid-cols-[1.4fr_1fr]">
                <div className="space-y-5">
                  {r.mechanism && (
                    <div>
                      <SectionLabel icon={Gauge}>How it works</SectionLabel>
                      <p className="mt-1.5 leading-relaxed">{r.mechanism}</p>
                    </div>
                  )}
                  {r.playbook?.length > 0 && (
                    <div>
                      <SectionLabel icon={ListChecks}>Playbook</SectionLabel>
                      <ol className="mt-2 space-y-2">
                        {r.playbook.map((step, j) => (
                          <li key={j} className="flex gap-3">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                              {j + 1}
                            </span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
                <div className="space-y-4 rounded-xl border bg-background/60 p-4">
                  <div>
                    <SectionLabel icon={Target}>Expected impact</SectionLabel>
                    <p className="mt-1.5 leading-relaxed">{r.expectedImpact}</p>
                  </div>
                  {r.metricsToWatch?.length > 0 && (
                    <div>
                      <SectionLabel icon={Gauge}>Metrics to watch</SectionLabel>
                      <ul className="mt-1.5 space-y-1">
                        {r.metricsToWatch.map((m) => (
                          <li key={m} className="flex gap-2">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground" />
                            <span className="tabular-nums">{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.pitfall && (
                    <div className="rounded-lg border border-serious/40 bg-serious/10 p-3">
                      <SectionLabel icon={AlertTriangle}>Pitfall</SectionLabel>
                      <p className="mt-1 leading-relaxed">{r.pitfall}</p>
                    </div>
                  )}
                  {r.evidence.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-xs text-muted-foreground">Evidence</span>
                      {r.evidence.map((e) => (
                        <Badge key={e} variant="outline" className="font-mono text-[10px] font-normal text-muted-foreground">
                          {e}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {plan.length > 0 && (
        <Card data-reveal>
          <CardHeader>
            <CardTitle>The next 30 days</CardTitle>
            <CardDescription>The recommendations as a schedule.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {plan.map((w) => (
                <li key={w.week} className="relative rounded-xl border bg-background/60 p-4">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Week {w.week}</div>
                  <div className="mt-1 font-semibold tracking-tight">{w.focus}</div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {w.actions.map((a) => (
                      <li key={a} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/60" />
                        <span className="leading-relaxed">{a}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {report.experiments.length > 0 && (
        <Card data-reveal>
          <CardHeader>
            <CardTitle>Experiments to run</CardTitle>
            <CardDescription>
              Hypotheses the data hints at but can’t yet prove.{" "}
              {canTrack && (
                <>
                  Press Track and CloutCraft scores it against your baseline after every sync —{" "}
                  <Link href={`/coach/experiments?window=${windowDays}`} className="underline underline-offset-4 hover:text-foreground">
                    see all experiments
                  </Link>
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hypothesis</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead>Success looks like</TableHead>
                  <TableHead className="text-right">Weeks</TableHead>
                  {canTrack && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.experiments.map((x, i) => {
                  const segment = trackingSegment(x);
                  const isTracked = tracked?.has(i) ?? false;
                  return (
                    <TableRow key={`${i}-${x.hypothesis}`}>
                      <TableCell className="max-w-xs whitespace-normal">
                        <div className="font-medium">{x.hypothesis}</div>
                        {segment && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {describeSegment(segment).map((part) => (
                              <Badge key={part} variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
                                {part}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{x.method}</TableCell>
                      <TableCell className="max-w-xs whitespace-normal text-muted-foreground">{x.successMetric}</TableCell>
                      <TableCell className="text-right tabular-nums">{x.durationWeeks}</TableCell>
                      {canTrack && (
                        <TableCell className="text-right">
                          {isTracked ? (
                            <Link
                              href={`/coach/experiments?window=${windowDays}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-good hover:underline"
                            >
                              <Check className="size-3.5" /> Tracking
                            </Link>
                          ) : segment ? (
                            <form action={startExperimentAction}>
                              <TrackFields x={x} index={i} runId={runId} windowDays={windowDays} />
                              <Button type="submit" size="sm" variant="outline" className="gap-1.5">
                                <FlaskConical /> Track
                              </Button>
                            </form>
                          ) : (
                            <Link
                              href={`/coach/experiments?window=${windowDays}`}
                              className="text-xs text-muted-foreground hover:underline"
                              title="This plan predates automatic tracking; define the experiment manually."
                            >
                              Define
                            </Link>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report.caveats.length > 0 && (
        <div data-reveal className="rounded-lg border border-dashed p-4">
          <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Caveats</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {report.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
