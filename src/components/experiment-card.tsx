import { CheckCircle2, FlaskConical, RotateCcw, Trash2, XCircle } from "lucide-react";
import { deleteExperimentAction, setExperimentStatusAction } from "@/app/coach/experiments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import type { ExperimentRecord } from "@/lib/db/repo";
import { describeSegment, formatMetricValue, METRIC_LABEL, type ExperimentScore } from "@/lib/experiments/score";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<ExperimentRecord["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
  active: { label: "Running", variant: "default" },
  won: { label: "Won", variant: "secondary", className: "bg-good/15 text-good" },
  lost: { label: "Lost", variant: "secondary", className: "bg-critical/15 text-critical" },
  inconclusive: { label: "Inconclusive", variant: "outline" },
  abandoned: { label: "Abandoned", variant: "outline", className: "text-muted-foreground" },
};

const CONFIDENCE: Record<ExperimentScore["confidence"], string> = {
  too_early: "too early to call",
  early: "early signal",
  solid: "solid sample",
};

function lift(value: number | null): string {
  if (value === null) return "—";
  const pct = Math.round(value * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
}

export function ExperimentCard({ experiment: x, score, windowDays }: { experiment: ExperimentRecord; score: ExperimentScore; windowDays: number }) {
  const status = STATUS[x.status];
  const headline = score.adjustedLift;
  const tone =
    headline === null || score.confidence === "too_early"
      ? "text-muted-foreground"
      : headline >= x.targetLift
        ? "text-good"
        : headline < 0
          ? "text-critical"
          : "text-foreground";
  const hidden = (
    <>
      <input type="hidden" name="id" value={x.id} />
      <input type="hidden" name="window" value={windowDays} />
    </>
  );

  return (
    <Card data-reveal className={cn("gap-3", x.status !== "active" && "bg-card/60")}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={status.variant} className={status.className}>
            {status.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {x.status === "active"
              ? score.ended
                ? "Planned run complete — close it with a verdict"
                : `${score.daysLeft} day${score.daysLeft === 1 ? "" : "s"} left`
              : `Started ${formatDate(x.startedAt)}${x.closedAt ? ` · closed ${formatDate(x.closedAt)}` : ""}`}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-1">
            {describeSegment(x.segment).map((part) => (
              <Badge key={part} variant="outline" className="font-normal text-muted-foreground">
                {part}
              </Badge>
            ))}
          </span>
        </div>
        <h3 className="text-base leading-snug font-medium">{x.title}</h3>
        <p className="text-xs text-muted-foreground">
          {METRIC_LABEL[x.metric]} · win at {lift(x.targetLift)}
          {x.successMetric ? ` · “${x.successMetric}”` : ""}
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border bg-background/60 text-sm">
          <div className="p-3">
            <div className="text-xs text-muted-foreground">Before</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{formatMetricValue(x.metric, score.baseline.value)}</div>
            <div className="text-xs text-muted-foreground">{score.baseline.n} uploads · 90 days prior</div>
          </div>
          <div className="border-l p-3">
            <div className="text-xs text-muted-foreground">During</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{formatMetricValue(x.metric, score.treatment.value)}</div>
            <div className="text-xs text-muted-foreground">
              {score.treatment.n} upload{score.treatment.n === 1 ? "" : "s"} so far
            </div>
          </div>
          <div className="border-l p-3">
            <div className="text-xs text-muted-foreground">{score.control ? "Adjusted lift" : "Lift"}</div>
            <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", tone)}>{lift(headline)}</div>
            <div className="text-xs text-muted-foreground">
              {CONFIDENCE[score.confidence]}
              {score.control && score.rawLift !== null ? ` · raw ${lift(score.rawLift)}` : ""}
            </div>
          </div>
        </div>

        {x.status === "active" && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(score.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-foreground/70" style={{ width: `${Math.max(2, score.progress * 100)}%` }} />
          </div>
        )}

        {x.method && <p className="text-sm text-muted-foreground">{x.method}</p>}
        {score.caveats.length > 0 && (
          <p className="text-xs text-muted-foreground/80">
            {score.control
              ? `Control: ${score.control.after.n} other uploads on the same platform (${formatMetricValue(x.metric, score.control.before.value)} → ${formatMetricValue(x.metric, score.control.after.value)}). `
              : ""}
            {score.caveats.join(" ")}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex-wrap gap-1.5 border-t pt-3 pb-3!">
        {x.status === "active" ? (
          <>
            <form action={setExperimentStatusAction}>
              {hidden}
              <input type="hidden" name="status" value="won" />
              <Button type="submit" size="sm" variant="outline" className="gap-1.5">
                <CheckCircle2 className="text-good" /> Won
              </Button>
            </form>
            <form action={setExperimentStatusAction}>
              {hidden}
              <input type="hidden" name="status" value="lost" />
              <Button type="submit" size="sm" variant="outline" className="gap-1.5">
                <XCircle className="text-critical" /> Lost
              </Button>
            </form>
            <form action={setExperimentStatusAction}>
              {hidden}
              <input type="hidden" name="status" value="inconclusive" />
              <Button type="submit" size="sm" variant="ghost">
                Inconclusive
              </Button>
            </form>
            {score.ended && score.verdict !== "inconclusive" && (
              <span className="text-xs text-muted-foreground">Data says: {score.verdict}.</span>
            )}
            <form action={setExperimentStatusAction} className="ml-auto">
              {hidden}
              <input type="hidden" name="status" value="abandoned" />
              <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
                Abandon
              </Button>
            </form>
          </>
        ) : (
          <>
            <form action={setExperimentStatusAction}>
              {hidden}
              <input type="hidden" name="status" value="active" />
              <Button type="submit" size="sm" variant="ghost" className="gap-1.5">
                <RotateCcw /> Reopen
              </Button>
            </form>
            <form action={deleteExperimentAction} className="ml-auto">
              {hidden}
              <Button type="submit" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 /> Delete
              </Button>
            </form>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export function ExperimentsEmpty() {
  return (
    <Card data-reveal className="items-center py-10 text-center">
      <FlaskConical className="size-8 text-muted-foreground" />
      <h2 className="mt-3 text-base font-medium">No experiments yet</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Press <strong className="font-medium text-foreground">Track</strong> on any experiment the coach suggests, or define one here. CloutCraft scores it against
        your baseline after every sync.
      </p>
    </Card>
  );
}
