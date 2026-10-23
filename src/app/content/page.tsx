import type { Metadata } from "next";
import type { PageWithSearchParams } from "@/lib/search-params";
import { ContentTabs } from "@/components/content-tabs";
import { ContentTable, type ContentRow } from "@/components/content-table";
import { EmptyState } from "@/components/empty-state";
import { FilterLinks, WindowPicker } from "@/components/filter-links";
import { Flash } from "@/components/flash";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardContent } from "@/components/ui/card";
import { loadDashboard, parseWindow } from "@/lib/dashboard";
import { formatCompact, formatUsd } from "@/lib/format";
import { isPlatform, type ContentKind } from "@/lib/platforms/types";

export const metadata: Metadata = { title: "Content" };
export const dynamic = "force-dynamic";

const KINDS: ContentKind[] = ["video", "short", "live"];
const SORTS = ["newest", "views", "earnings", "velocity", "ratio"] as const;
type Sort = (typeof SORTS)[number];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ContentPage({ searchParams }: PageWithSearchParams) {
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

  const platform = first(params.platform);
  const kind = first(params.kind);
  const sortParam = first(params.sort);
  const sort: Sort = (SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as Sort) : "newest";

  const scoreById = new Map([...data.report.topPerformers, ...data.report.underperformers].map((s) => [s.id, s]));
  const baselines = data.report.baselines;

  let rows: ContentRow[] = data.inWindow
    .filter((e) => !platform || e.item.platform === platform)
    .filter((e) => !kind || e.item.kind === kind)
    .map((e) => {
      const baseline = baselines.find((b) => b.platform === e.item.platform && b.kind === e.item.kind);
      const vsBaseline =
        scoreById.get(e.item.id)?.viewsVsBaseline ??
        (baseline && baseline.count >= 3 && baseline.medianViews > 0 ? e.item.views / baseline.medianViews : null);
      return { entry: e, views24h: data.views24h.perItem.get(e.item.id) ?? null, vsBaseline };
    });

  rows = rows.sort((a, b) => {
    switch (sort) {
      case "views":
        return b.entry.item.views - a.entry.item.views;
      case "earnings":
        return b.entry.estimate.mid - a.entry.estimate.mid;
      case "velocity":
        return (b.views24h ?? -1) - (a.views24h ?? -1);
      case "ratio":
        return (b.vsBaseline ?? -1) - (a.vsBaseline ?? -1);
      default:
        return new Date(b.entry.item.publishedAt).getTime() - new Date(a.entry.item.publishedAt).getTime();
    }
  });

  const totalViews = rows.reduce((s, r) => s + r.entry.item.views, 0);
  const totalMid = rows.reduce((s, r) => s + r.entry.estimate.mid, 0);

  return (
    <Reveal className="space-y-6">
      <Flash params={params} />
      <div data-reveal className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} items · {formatCompact(totalViews)} views · {formatUsd(totalMid)} estimated
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ContentTabs active="uploads" windowDays={windowDays} />
          <WindowPicker base="/content" params={params} current={windowDays} options={data.windowOptions} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterLinks
          label="Platform"
          base="/content"
          params={params}
          param="platform"
          current={platform && isPlatform(platform) ? platform : undefined}
          options={[
            { value: undefined, label: "All" },
            { value: "youtube", label: "YouTube" },
            { value: "twitch", label: "Twitch" },
            { value: "tiktok", label: "TikTok" },
          ]}
        />
        <FilterLinks
          label="Format"
          base="/content"
          params={params}
          param="kind"
          current={KINDS.includes(kind as ContentKind) ? kind : undefined}
          options={[
            { value: undefined, label: "All" },
            { value: "video", label: "Videos" },
            { value: "short", label: "Shorts" },
            { value: "live", label: "Live" },
          ]}
        />
        <FilterLinks
          label="Sort"
          base="/content"
          params={params}
          param="sort"
          current={sort === "newest" ? undefined : sort}
          options={[
            { value: undefined, label: "Newest" },
            { value: "views", label: "Views" },
            { value: "earnings", label: "Earnings" },
            { value: "velocity", label: "New views" },
            { value: "ratio", label: "vs. median" },
          ]}
        />
      </div>

      <Card data-reveal className="py-0">
        <CardContent className="px-0">
          <ContentTable rows={rows.slice(0, 300)} />
        </CardContent>
      </Card>
    </Reveal>
  );
}
