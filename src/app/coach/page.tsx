import type { Metadata } from "next";
import Link from "next/link";
import { CoachForm } from "@/components/coach-form";
import { CoachReportView } from "@/components/coach-report";
import { EmptyState } from "@/components/empty-state";
import { WindowPicker } from "@/components/filter-links";
import { FindingCard } from "@/components/finding-card";
import { Flash } from "@/components/flash";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { coachAvailability } from "@/lib/ai/providers";
import type { CoachReport } from "@/lib/ai/schema";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { listCoachRuns } from "@/lib/db/repo";
import type { PageWithSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Coach" };
export const dynamic = "force-dynamic";
// Generating a plan takes 20–60 s; this also applies to the page's server action.
export const maxDuration = 60;

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function CoachPage({ searchParams }: PageWithSearchParams) {
  const params = await searchParams;
  const windowDays = parseWindow(params.window);
  const data = await loadDashboard(windowDays);
  const runs = await listCoachRuns<CoachReport>(data.workspaceId, 12);
  const requested = Number(Array.isArray(params.run) ? params.run[0] : params.run);
  const selected = runs.find((r) => r.id === requested) ?? runs[0];
  const availability = coachAvailability();
  const enabled = availability.enabled;
  const providerLabel = availability.primary
    ? `${availability.primary.label} · ${availability.primary.model}${
        availability.fallbacks.length ? ` (falls back to ${availability.fallbacks.map((f) => f.label).join(", ")})` : ""
      }`
    : undefined;

  return (
    <Reveal className="space-y-6">
      <Flash params={params} />

      {/* Hero: ask the coach */}
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
              {data.hasData
                ? `Reads ${data.report.totals.items} items from the last ${windowDays} days and ${data.report.findings.length} findings, then answers with mechanisms, playbooks and a 30-day schedule.`
                : "Connect a platform or install the demo data to give the coach something to work with."}
            </p>
          </div>
          <WindowPicker base="/coach" params={params} current={windowDays} options={data.windowOptions} />
        </div>
        {data.hasData && (
          <div className="mt-6 max-w-3xl">
            <CoachForm
              windowDays={windowDays}
              enabled={enabled}
              hasData={data.hasData}
              disabledReason={availability.hint}
              providerLabel={providerLabel}
            />
          </div>
        )}
      </section>

      {!data.hasData ? (
        <EmptyState connections={data.connections} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {selected ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Plan from {timeFormat.format(new Date(selected.createdAt))} · {selected.model}
                  {typeof selected.usage?.windowDays === "number" && ` · ${selected.usage.windowDays}-day window`}
                </p>
                <CoachReportView
                  report={selected.output}
                  question={typeof selected.usage?.creatorNotes === "string" ? selected.usage.creatorNotes : undefined}
                />
              </div>
            ) : (
              <Card data-reveal className="border-dashed">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No plan yet. Ask a question above, or generate a plan with no question for a general review.
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="space-y-6">
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

            {runs.length > 1 && (
              <Card data-reveal>
                <CardHeader>
                  <CardTitle>Previous plans</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {runs.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/coach?window=${windowDays}&run=${r.id}`}
                          className={cn(
                            "block rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                            selected?.id === r.id ? "bg-accent font-medium" : "text-muted-foreground",
                          )}
                        >
                          {timeFormat.format(new Date(r.createdAt))}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {typeof r.usage?.creatorNotes === "string" && r.usage.creatorNotes
                              ? `“${r.usage.creatorNotes.slice(0, 40)}${r.usage.creatorNotes.length > 40 ? "…" : ""}”`
                              : `${r.output.recommendations.length} recommendations`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      )}
    </Reveal>
  );
}
