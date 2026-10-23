import type { Metadata } from "next";
import { CoachShell } from "@/components/coach-shell";
import { CoachSidebar } from "@/components/coach-sidebar";
import { EmptyState } from "@/components/empty-state";
import { ExperimentCard, ExperimentsEmpty } from "@/components/experiment-card";
import { ExperimentForm } from "@/components/experiment-form";
import { Flash } from "@/components/flash";
import { Reveal } from "@/components/motion/reveal";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { listCoachThreads, listExperiments } from "@/lib/db/repo";
import { env } from "@/lib/env";
import { scoreExperiment } from "@/lib/experiments/score";
import type { PageWithSearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Experiments" };
export const dynamic = "force-dynamic";

export default async function ExperimentsPage({ searchParams }: PageWithSearchParams) {
  const params = await searchParams;
  const windowDays = parseWindow(params.window);
  const data = await loadDashboard(windowDays);

  if (!data.hasData) {
    return (
      <Reveal className="space-y-4">
        <Flash params={params} />
        <EmptyState connections={data.connections} />
      </Reveal>
    );
  }

  const [threads, experiments] = await Promise.all([listCoachThreads(data.workspaceId), listExperiments(data.workspaceId)]);
  const timeZone = env().ANALYSIS_TIMEZONE;
  const scored = experiments.map((x) => ({ x, score: scoreExperiment(x, data.estimated, data.now, timeZone) }));
  const running = scored.filter((s) => s.x.status === "active");
  const finished = scored.filter((s) => s.x.status !== "active");
  const won = finished.filter((s) => s.x.status === "won").length;
  const lost = finished.filter((s) => s.x.status === "lost").length;

  return (
    <CoachShell
      sidebar={
        <CoachSidebar threads={threads} activeThreadId={null} windowDays={windowDays} now={data.now} section="experiments" activeExperiments={running.length} />
      }
      aside={<ExperimentForm windowDays={windowDays} />}
    >
      <Flash params={params} />
      <div data-reveal>
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Growth coach</div>
        <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
        <p className="text-sm text-muted-foreground">
          {running.length} running · {won} won · {lost} lost. Each one is re-scored against your baseline after every sync.
        </p>
      </div>

      {scored.length === 0 ? (
        <ExperimentsEmpty />
      ) : (
        <>
          {running.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Running</h2>
              {running.map(({ x, score }) => (
                <ExperimentCard key={x.id} experiment={x} score={score} windowDays={windowDays} />
              ))}
            </section>
          )}
          {finished.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Finished</h2>
              {finished.map(({ x, score }) => (
                <ExperimentCard key={x.id} experiment={x} score={score} windowDays={windowDays} />
              ))}
            </section>
          )}
        </>
      )}
    </CoachShell>
  );
}
