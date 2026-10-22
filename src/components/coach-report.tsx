import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CoachReport, Recommendation } from "@/lib/ai/schema";

const CATEGORY_LABEL: Record<Recommendation["category"], string> = {
  content_strategy: "Content strategy",
  format_mix: "Format mix",
  cadence: "Cadence",
  timing: "Timing",
  monetization: "Monetization",
  audience: "Audience",
  cross_platform: "Cross-platform",
};

const PRIORITY_VARIANT: Record<Recommendation["priority"], "default" | "secondary" | "outline"> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

export function CoachReportView({ report, question }: { report: CoachReport; question?: string }) {
  const answer = report.answer?.trim();
  return (
    <div className="space-y-6">
      {question && (
        <Card className="border-foreground/20">
          <CardHeader>
            <CardDescription>You asked</CardDescription>
            <CardTitle className="text-base font-medium">“{question}”</CardTitle>
          </CardHeader>
          {answer && (
            <CardContent>
              <p className="text-sm leading-relaxed">{answer}</p>
            </CardContent>
          )}
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Where you stand</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">{report.summary}</p>
          {report.strengths.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">What’s working</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {report.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Recommendations</h2>
        {report.recommendations.map((r, i) => (
          <Card key={`${i}-${r.title}`}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={PRIORITY_VARIANT[r.priority]} className="capitalize">
                  {r.priority} priority
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {CATEGORY_LABEL[r.category]}
                </Badge>
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  {r.effort} effort
                </Badge>
              </div>
              <CardTitle className="text-base">{r.title}</CardTitle>
              <CardDescription>{r.rationale}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Do this</div>
                <p className="mt-0.5">{r.action}</p>
              </div>
              <div>
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Expected impact</div>
                <p className="mt-0.5 text-muted-foreground">{r.expectedImpact}</p>
              </div>
              {r.evidence.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">Evidence:</span>
                  {r.evidence.map((e) => (
                    <Badge key={e} variant="outline" className="font-mono text-[10px] font-normal text-muted-foreground">
                      {e}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {report.experiments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Experiments to run</CardTitle>
            <CardDescription>Hypotheses the data hints at but can’t yet prove.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hypothesis</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead>Success looks like</TableHead>
                  <TableHead className="text-right">Weeks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.experiments.map((x) => (
                  <TableRow key={x.hypothesis}>
                    <TableCell className="max-w-xs whitespace-normal font-medium">{x.hypothesis}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-muted-foreground">{x.method}</TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-muted-foreground">{x.successMetric}</TableCell>
                    <TableCell className="text-right tabular-nums">{x.durationWeeks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report.caveats.length > 0 && (
        <div className="rounded-lg border border-dashed p-4">
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
