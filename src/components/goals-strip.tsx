import { Check, Flag, Plus, Trash2 } from "lucide-react";
import { createGoalAction, deleteGoalAction, setGoalStatusAction } from "@/app/dashboard/goal-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { GoalView } from "@/lib/dashboard";
import { formatCompact, formatUsd } from "@/lib/format";
import { formatMonth, formatRate, GOAL_METRIC_LABEL, type GoalVerdict } from "@/lib/goals";
import { PLATFORM_LABEL, type Platform } from "@/lib/platforms/types";
import { cn } from "@/lib/utils";

const VERDICT: Record<GoalVerdict, { label: string; className: string }> = {
  reached: { label: "Reached", className: "bg-good/15 text-good" },
  on_track: { label: "On track", className: "bg-good/15 text-good" },
  behind: { label: "Behind pace", className: "bg-warn/15 text-warn" },
  stalled: { label: "Not growing", className: "bg-critical/15 text-critical" },
  no_pace: { label: "Pace unknown", className: "text-muted-foreground" },
};

const deadline = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function value(v: GoalView, n: number): string {
  return v.goal.metric === "followers" ? formatCompact(n) : formatUsd(n);
}

function GoalCard({ view }: { view: GoalView }) {
  const { goal, projection: p } = view;
  const verdict = VERDICT[p.verdict];
  const pace =
    p.verdict === "reached"
      ? "Target passed — mark it done or raise it."
      : p.verdict === "no_pace"
        ? "Needs a week or two of history to measure your pace."
        : p.verdict === "stalled"
          ? `Recent pace ${formatRate(p.paceMonthly)}; the deadline needs ${formatRate(p.requiredMonthly)}.`
          : `At ${formatRate(p.paceMonthly)}: ${p.projectedDate ? formatMonth(p.projectedDate) : "—"} · deadline ${deadline.format(new Date(`${goal.targetDate}T00:00:00Z`))} needs ${formatRate(p.requiredMonthly)}.`;

  return (
    <Card data-reveal className="group/goal relative gap-2 py-4">
      <CardContent className="space-y-2 px-4">
        <div className="flex items-center gap-2">
          <Flag className="size-3.5 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{view.label}</span>
          <Badge variant="secondary" className={cn("ml-auto font-normal", verdict.className)}>
            {verdict.label}
          </Badge>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{value(view, p.current)}</span>
          <span className="text-sm text-muted-foreground tabular-nums">/ {value(view, goal.target)}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(p.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full rounded-full", p.verdict === "behind" ? "bg-warn" : p.verdict === "stalled" ? "bg-critical" : "bg-good")} style={{ width: `${Math.max(2, p.progress * 100)}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{pace}</p>
        <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 transition-opacity group-hover/goal:opacity-100 focus-within:opacity-100">
          {p.verdict === "reached" && (
            <form action={setGoalStatusAction}>
              <input type="hidden" name="id" value={goal.id} />
              <input type="hidden" name="status" value="reached" />
              <button type="submit" aria-label="Mark goal reached" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-good">
                <Check className="size-3.5" />
              </button>
            </form>
          )}
          <form action={deleteGoalAction}>
            <input type="hidden" name="id" value={goal.id} />
            <button type="submit" aria-label="Remove goal" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
              <Trash2 className="size-3.5" />
            </button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function GoalForm({ platforms, defaultDate }: { platforms: Platform[]; defaultDate: string }) {
  return (
    <form action={createGoalAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="goal-metric">Goal</Label>
        <NativeSelect id="goal-metric" name="metric" defaultValue="followers">
          <option value="followers">{GOAL_METRIC_LABEL.followers}</option>
          <option value="monthly_earnings">{GOAL_METRIC_LABEL.monthly_earnings}</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goal-platform">On</Label>
        <NativeSelect id="goal-platform" name="platform" defaultValue={platforms[0] ?? "all"}>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
          <option value="all">All platforms</option>
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goal-target">Target</Label>
        <Input id="goal-target" name="target" placeholder="e.g. 250k or 5000" required inputMode="decimal" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="goal-date">By</Label>
        <Input id="goal-date" name="targetDate" type="date" defaultValue={defaultDate} required />
      </div>
      <Button type="submit">Set goal</Button>
    </form>
  );
}

/**
 * Goals under the KPI row: one compact card per active goal plus an
 * add-goal disclosure. With no goals it collapses to a single dashed row.
 */
export function GoalsStrip({ goals, reached, platforms, now }: { goals: GoalView[]; reached: number; platforms: Platform[]; now: Date }) {
  const defaultDate = new Date(now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
  const addForm = (
    <details className="group/add">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <Plus className="size-3.5" />
        {goals.length ? "Add another goal" : "Set a goal — e.g. 250k YouTube followers by next summer. The coach plans toward it."}
        {reached > 0 && <span className="ml-auto text-xs">{reached} reached</span>}
      </summary>
      <div className="pt-3">
        <GoalForm platforms={platforms} defaultDate={defaultDate} />
      </div>
    </details>
  );

  if (goals.length === 0) {
    return (
      <section id="goals" data-reveal className="rounded-xl border border-dashed px-4 py-3">
        {addForm}
      </section>
    );
  }
  return (
    <section id="goals" className="space-y-3">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {goals.map((v) => (
          <GoalCard key={v.goal.id} view={v} />
        ))}
      </div>
      <div data-reveal className="rounded-xl border border-dashed px-4 py-2.5">{addForm}</div>
    </section>
  );
}
