import { startExperimentAction } from "@/app/coach/experiments/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EXPERIMENT_METRICS, METRIC_LABEL } from "@/lib/experiments/score";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/platforms/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Manual experiment definition; works without JavaScript. */
export function ExperimentForm({ windowDays }: { windowDays: number }) {
  return (
    <Card data-reveal>
      <CardHeader>
        <CardTitle>Define an experiment</CardTitle>
        <CardDescription>Describe which uploads count as the test; the scoring is automatic.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={startExperimentAction} className="space-y-4 text-sm">
          <input type="hidden" name="window" value={windowDays} />
          <div className="space-y-1.5">
            <Label htmlFor="exp-title">Hypothesis</Label>
            <Input id="exp-title" name="title" required maxLength={200} placeholder="e.g. Friday TikToks over 60 s earn more" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-platform">Platform</Label>
              <NativeSelect id="exp-platform" name="platform" defaultValue="">
                <option value="">Any</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-kind">Format</Label>
              <NativeSelect id="exp-kind" name="kind" defaultValue="">
                <option value="">Any</option>
                <option value="video">Videos</option>
                <option value="short">Shorts</option>
                <option value="live">Live</option>
              </NativeSelect>
            </div>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Publish days</legend>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d, i) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="weekdays" value={i} className="peer sr-only" />
                  <span className="inline-flex h-7 items-center rounded-md border px-2 text-xs text-muted-foreground transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                    {d}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Leave all unchecked unless timing is what you are testing.</p>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-min">Min length (s)</Label>
              <Input id="exp-min" name="minDurationSec" type="number" min={0} inputMode="numeric" placeholder="any" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-max">Max length (s)</Label>
              <Input id="exp-max" name="maxDurationSec" type="number" min={0} inputMode="numeric" placeholder="any" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-metric">Metric</Label>
            <NativeSelect id="exp-metric" name="metric" defaultValue="median_views">
              {EXPERIMENT_METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABEL[m]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-lift">Win at (+%)</Label>
              <Input id="exp-lift" name="targetLiftPercent" type="number" min={1} max={500} defaultValue={20} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-duration">Run for</Label>
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <Input id="exp-duration" name="durationValue" type="number" min={1} max={182} defaultValue={4} inputMode="numeric" required />
                <NativeSelect name="durationUnit" defaultValue="weeks" aria-label="Duration unit" className="w-24">
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                </NativeSelect>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Anything from a day to six months. A verdict needs at least 3 uploads in the test, so a one- or two-day run only shows a result if you post that
            much inside it; scores refresh after each sync.
          </p>
          <Button type="submit" className="w-full">
            Start tracking
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
