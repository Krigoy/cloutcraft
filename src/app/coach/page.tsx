import type { Metadata } from "next";
import type { PageWithSearchParams } from "@/lib/search-params";
import Link from "next/link";
import { CoachForm } from "@/components/coach-form";
import { CoachReportView } from "@/components/coach-report";
import { EmptyState } from "@/components/empty-state";
import { WindowPicker } from "@/components/filter-links";
import { FindingCard } from "@/components/finding-card";
import { Flash } from "@/components/flash";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoachReport } from "@/lib/ai/schema";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { listCoachRuns } from "@/lib/db/repo";
import { coachAvailability } from "@/lib/ai/providers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Coach" };
export const dynamic = "force-dynamic";

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function CoachPage({ searchParams }: PageWithSearchParams) {
  const params = await searchParams;
  const windowDays = parseWindow(params.window);
  const data = await loadDashboard(windowDays);
  const runs = listCoachRuns<CoachReport>(data.workspaceId, 12);
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
      <div data-reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Growth coach</h1>
          <p className="text-sm text-muted-foreground">
            Claude reads the findings below and turns them into a prioritised plan with evidence.
          </p>
        </div>
        <WindowPicker base="/coach" params={params} current={windowDays} options={data.windowOptions} />
      </div>

      {!data.hasData ? (
        <EmptyState connections={data.connections} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card data-reveal>
              <CardHeader>
                <CardTitle>New plan</CardTitle>
                <CardDescription>
                  Based on {data.report.totals.items} items from the last {windowDays} days and {data.report.findings.length} findings.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CoachForm
                  windowDays={windowDays}
                  enabled={enabled}
                  hasData={data.hasData}
                  disabledReason={availability.hint}
                  providerLabel={providerLabel}
                />
              </CardContent>
            </Card>

            {selected ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Plan from {timeFormat.format(new Date(selected.createdAt))} · {selected.model}
                  {typeof selected.usage?.windowDays === "number" && ` · ${selected.usage.windowDays}-day window`}
                </p>
                <CoachReportView report={selected.output} />
              </div>
            ) : (
              <Card data-reveal className="border-dashed">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No plan yet. The findings on the right are what the coach will reason from.
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
                            {r.output.recommendations.length} recommendations
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
