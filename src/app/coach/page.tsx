import type { Metadata } from "next";
import { CoachForm } from "@/components/coach-form";
import { CoachReportView } from "@/components/coach-report";
import { CoachSidebar } from "@/components/coach-sidebar";
import { EmptyState } from "@/components/empty-state";
import { WindowPicker } from "@/components/filter-links";
import { FindingCard } from "@/components/finding-card";
import { Flash } from "@/components/flash";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { coachAvailability } from "@/lib/ai/providers";
import type { CoachReport } from "@/lib/ai/schema";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { latestThreadId, listCoachThreads, listThreadRuns } from "@/lib/db/repo";
import { firstParam, type PageWithSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Coach" };
export const dynamic = "force-dynamic";
// Generating a plan takes 25–45 s and the provider chain may retry; this also
// applies to the page's server action. Vercel Hobby allows 120 s with Fluid compute.
export const maxDuration = 120;

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function CoachPage({ searchParams }: PageWithSearchParams) {
  const params = await searchParams;
  const windowDays = parseWindow(params.window);
  const data = await loadDashboard(windowDays);
  const availability = coachAvailability();
  const providerLabel = availability.primary
    ? `${availability.primary.label} · ${availability.primary.model}${
        availability.fallbacks.length ? ` (falls back to ${availability.fallbacks.map((f) => f.label).join(", ")})` : ""
      }`
    : undefined;

  // Which conversation to show: ?thread=<id>, ?thread=new, or the most recent one.
  const threadParam = firstParam(params.thread);
  const threads = await listCoachThreads(data.workspaceId);
  let activeThreadId: number | null = null;
  if (threadParam !== "new") {
    const requested = Number(threadParam);
    activeThreadId = Number.isInteger(requested) && requested > 0 ? requested : await latestThreadId(data.workspaceId);
  }
  const turns = activeThreadId ? await listThreadRuns<CoachReport>(data.workspaceId, activeThreadId) : [];
  if (activeThreadId && turns.length === 0) activeThreadId = null; // stale or foreign id → new conversation
  const latest = turns[turns.length - 1];

  const composer = (
    <CoachForm
      windowDays={windowDays}
      threadId={activeThreadId ?? undefined}
      enabled={availability.enabled}
      hasData={data.hasData}
      disabledReason={availability.hint}
      providerLabel={providerLabel}
    />
  );

  return (
    <div data-full-bleed>
      <Reveal>
        {!data.hasData ? (
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Flash params={params} />
            <EmptyState connections={data.connections} />
          </div>
        ) : (
          <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
            {/* Sidebar: past conversations, pinned to the left edge */}
            <aside
              data-reveal
              className="max-h-80 overflow-hidden border-b bg-card/40 p-3 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:max-h-none lg:border-r lg:border-b-0 lg:p-4"
            >
              <CoachSidebar threads={threads} activeThreadId={activeThreadId} windowDays={windowDays} now={data.now} />
            </aside>

            {/* Main column */}
            <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-4xl space-y-6">
                <Flash params={params} />
                {activeThreadId === null ? (
                  <section
                    data-reveal
                    className="relative isolate overflow-hidden rounded-3xl border bg-card/60 px-6 py-8 backdrop-blur sm:px-10 sm:py-10"
                  >
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                      <span className="absolute -top-24 left-[5%] size-72 rounded-full bg-twitch/30 blur-3xl" />
                      <span className="absolute top-0 right-[8%] size-64 rounded-full bg-youtube/20 blur-3xl" />
                      <span className="absolute -bottom-24 left-[45%] size-64 rounded-full bg-tiktok/20 blur-3xl" />
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-4">
                      <div className="max-w-2xl">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Growth coach</div>
                        <h1 className="hero-figure mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                          Ask anything. Get a plan built on your numbers.
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Reads {data.report.totals.items} items from the last {windowDays} days and {data.report.findings.length}{" "}
                          findings, then answers with mechanisms, playbooks and a 30-day schedule. Follow-ups continue the conversation.
                        </p>
                      </div>
                      <WindowPicker base="/coach" params={params} current={windowDays} options={data.windowOptions} />
                    </div>
                    <div className="mt-6 max-w-3xl">{composer}</div>
                  </section>
                ) : (
                  <>
                    <div data-reveal className="flex flex-wrap items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Conversation</div>
                        <h1 className="truncate text-2xl font-semibold tracking-tight">{turns[0].question || "General review"}</h1>
                        <p className="text-sm text-muted-foreground">
                          Started {timeFormat.format(new Date(turns[0].createdAt))} · {turns.length} {turns.length === 1 ? "turn" : "turns"}
                        </p>
                      </div>
                      <WindowPicker base="/coach" params={params} current={windowDays} options={data.windowOptions} />
                    </div>

                    {turns.map((run, i) => {
                      const isLatest = run.id === latest.id;
                      const meta = `${timeFormat.format(new Date(run.createdAt))} · ${run.model}${
                        typeof run.usage?.windowDays === "number" ? ` · ${run.usage.windowDays}-day window` : ""
                      }`;
                      return (
                        <section key={run.id} id={`turn-${run.id}`} className="scroll-mt-24 space-y-3">
                          {isLatest ? (
                            <>
                              <p className="text-xs text-muted-foreground">
                                Turn {i + 1} · {meta}
                              </p>
                              <CoachReportView report={run.output} question={run.question || undefined} />
                            </>
                          ) : (
                            <details data-reveal className="group rounded-2xl border bg-card/60">
                              <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
                                <div className="text-xs text-muted-foreground">
                                  Turn {i + 1} · {meta}
                                </div>
                                <div className="mt-1 font-medium">{run.question || "General review"}</div>
                                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                  {run.output.answer?.trim() || run.output.summary}
                                </p>
                                <div className="mt-2 text-xs text-muted-foreground group-open:hidden">Show full plan</div>
                              </summary>
                              <div className="border-t px-5 py-5">
                                <CoachReportView report={run.output} question={run.question || undefined} />
                              </div>
                            </details>
                          )}
                        </section>
                      );
                    })}

                    <Card data-reveal className="border-foreground/15 bg-card/60 backdrop-blur">
                      <CardContent className="pt-2">{composer}</CardContent>
                    </Card>
                  </>
                )}
              </div>
            </div>

            {/* Evidence */}
            <aside className="border-t p-4 xl:sticky xl:top-14 xl:h-[calc(100vh-3.5rem)] xl:overflow-y-auto xl:border-t-0 xl:border-l">
              <Card data-reveal>
                <CardHeader>
                  <CardTitle>Evidence</CardTitle>
                  <CardDescription>Deterministic findings the coach must cite.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.report.findings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No patterns yet — more content needed.</p>
                  ) : (
                    data.report.findings.map((f) => <FindingCard key={f.id} finding={f} />)
                  )}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </Reveal>
    </div>
  );
}
