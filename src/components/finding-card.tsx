import { AlertTriangle, Info, Lightbulb, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Finding, FindingSeverity } from "@/lib/insights/analyze";
import { cn } from "@/lib/utils";
import { PlatformBadge } from "./badges";

const SEVERITY: Record<FindingSeverity, { label: string; icon: typeof Info; className: string }> = {
  warning: { label: "Needs attention", icon: AlertTriangle, className: "text-serious" },
  opportunity: { label: "Opportunity", icon: Lightbulb, className: "text-foreground" },
  positive: { label: "Working", icon: TrendingUp, className: "text-good" },
  info: { label: "Context", icon: Info, className: "text-muted-foreground" },
};

export function FindingCard({ finding, compact = false }: { finding: Finding; compact?: boolean }) {
  const s = SEVERITY[finding.severity];
  const Icon = s.icon;
  return (
    <article data-reveal className="lift flex gap-3 rounded-lg border bg-card p-3 text-card-foreground">
      <Icon className={cn("mt-0.5 size-4 shrink-0", s.className)} aria-label={s.label} />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
            {finding.id}
          </Badge>
          {finding.platform && <PlatformBadge platform={finding.platform} />}
          <span className="text-xs text-muted-foreground">{s.label}</span>
        </div>
        <h3 className="text-sm leading-snug font-medium">{finding.title}</h3>
        {!compact && <p className="text-sm text-muted-foreground">{finding.detail}</p>}
      </div>
    </article>
  );
}
