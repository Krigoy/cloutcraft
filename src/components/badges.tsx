import { Badge } from "@/components/ui/badge";
import type { EstimateBasis } from "@/lib/earnings/estimate";
import {
  CONTENT_KIND_LABEL,
  PLATFORM_LABEL,
  type ContentKind,
  type Platform,
} from "@/lib/platforms/types";
import { cn } from "@/lib/utils";

export const PLATFORM_DOT: Record<Platform, string> = {
  youtube: "bg-youtube",
  twitch: "bg-twitch",
  tiktok: "bg-tiktok",
};

export function PlatformDot({ platform, className }: { platform: Platform; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", PLATFORM_DOT[platform], className)} />;
}

export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", className)}>
      <PlatformDot platform={platform} />
      {PLATFORM_LABEL[platform]}
    </Badge>
  );
}

export function KindBadge({ kind }: { kind: ContentKind }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {CONTENT_KIND_LABEL[kind]}
    </Badge>
  );
}

const BASIS: Record<EstimateBasis, { label: string; title: string }> = {
  reported: { label: "Reported", title: "Figure reported by the platform." },
  calibrated: { label: "Calibrated", title: "Modelled per item, then scaled to match the platform's reported total." },
  modeled: { label: "Estimated", title: "Modelled from views and the payout assumptions in Settings." },
  none: { label: "Not estimable", title: "The platform does not expose this income, so nothing is counted." },
};

export function BasisBadge({ basis }: { basis: EstimateBasis }) {
  const b = BASIS[basis];
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground" title={b.title}>
      {b.label}
    </Badge>
  );
}
