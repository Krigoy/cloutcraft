import type { Metadata } from "next";
import type { PageWithSearchParams } from "@/lib/search-params";
import Link from "next/link";
import { PlatformBadge } from "@/components/badges";
import { Flash } from "@/components/flash";
import { Reveal } from "@/components/motion/reveal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRateOverrides, lastSchedulerRun, listConnections } from "@/lib/db/repo";
import { RATE_DEFINITIONS } from "@/lib/earnings/rates";
import { coachAvailability, providerConfigs } from "@/lib/ai/providers";
import { env } from "@/lib/env";
import { appOriginFromContext } from "@/lib/origin";
import { getAdapter } from "@/lib/platforms";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/platforms/types";
import { getWorkspaceId } from "@/lib/session";
import { cn } from "@/lib/utils";
import { resetRatesAction, saveRatesAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** The scheduler is considered running if it ticked within LIVE_FRESH_MINUTES. */
function schedulerIsFresh(ranAt: string | undefined, freshMinutes: number): boolean {
  if (!ranAt) return false;
  return Date.now() - new Date(ranAt).getTime() < freshMinutes * 60_000;
}

const CREDENTIAL_HINT = {
  youtube: "Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.local (Google Cloud Console → OAuth client).",
  twitch: "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env.local (dev.twitch.tv/console).",
  tiktok: "Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in .env.local (developers.tiktok.com). Requires HTTPS, so set APP_URL to a tunnel URL.",
} as const;

export default async function SettingsPage({ searchParams }: PageWithSearchParams) {
  const params = await searchParams;
  const workspaceId = await getWorkspaceId();
  const connections = listConnections(workspaceId);
  const overrides = getRateOverrides(workspaceId);
  const lastRun = lastSchedulerRun();
  const e = env();
  const origin = await appOriginFromContext();
  const coach = coachAvailability();
  const demoInstalled = connections.some((c) => c.isDemo);

  return (
    <Reveal className="space-y-8">
      <Flash params={params} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Connections, the sync schedule, and the payout assumptions behind every estimate.</p>
      </div>

      {/* Connections */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Connections</h2>
          <div className="flex items-center gap-2">
            <form action="/api/sync" method="post">
              <Button type="submit" variant="outline" size="sm" disabled={connections.length === 0}>
                Sync all now
              </Button>
            </form>
            <form action="/api/demo" method="post">
              <input type="hidden" name="action" value={demoInstalled ? "remove" : "install"} />
              <Button type="submit" variant={demoInstalled ? "ghost" : "secondary"} size="sm">
                {demoInstalled ? "Remove demo channels" : "Install demo channels"}
              </Button>
            </form>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const conn = connections.find((c) => c.platform === platform);
            const adapter = getAdapter(platform);
            const configured = adapter.isConfigured();
            return (
              <Card data-reveal key={platform} className="gap-4">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <PlatformBadge platform={platform} />
                    {conn ? (
                      <Badge variant={conn.lastSyncError ? "destructive" : "secondary"}>
                        {conn.isDemo ? "demo" : conn.lastSyncError ? "sync failed" : "connected"}
                      </Badge>
                    ) : (
                      <Badge variant="outline">not connected</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {conn ? (
                      <>
                        {conn.displayName ?? PLATFORM_LABEL[platform]}
                        {conn.handle ? ` · ${conn.handle}` : ""}
                      </>
                    ) : (
                      `Read-only access to your ${PLATFORM_LABEL[platform]} stats.`
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {conn ? (
                    <>
                      <div className="text-muted-foreground">
                        Last synced {conn.lastSyncedAt ? timeFormat.format(new Date(conn.lastSyncedAt)) : "never"}
                      </div>
                      {conn.lastSyncError && <p className="text-xs text-destructive">{conn.lastSyncError}</p>}
                    </>
                  ) : (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {adapter.scopes.map((s) => (
                        <li key={s} className="break-all">
                          {s.replace("https://www.googleapis.com/auth/", "")}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!configured && !conn && <p className="text-xs text-muted-foreground">{CREDENTIAL_HINT[platform]}</p>}
                </CardContent>
                <CardFooter className="gap-2">
                  {conn && !conn.isDemo ? (
                    <>
                      <Link href={`/api/auth/${platform}/start`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Reconnect
                      </Link>
                      <form action={`/api/connections/${platform}/disconnect`} method="post">
                        <Button type="submit" variant="ghost" size="sm">
                          Disconnect
                        </Button>
                      </form>
                    </>
                  ) : conn?.isDemo ? (
                    <span className="text-xs text-muted-foreground">Replace by connecting the real account.</span>
                  ) : null}
                  {(!conn || conn.isDemo) &&
                    (configured ? (
                      <Link href={`/api/auth/${platform}/start`} className={buttonVariants({ size: "sm" })}>
                        Connect {PLATFORM_LABEL[platform]}
                      </Link>
                    ) : (
                      <Button size="sm" disabled>
                        Connect {PLATFORM_LABEL[platform]}
                      </Button>
                    ))}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Scheduler */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Automatic updates</h2>
        <Card data-reveal>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", schedulerIsFresh(lastRun?.ranAt, e.LIVE_FRESH_MINUTES) ? "bg-good" : "bg-muted-foreground/40")} />
                {lastRun ? (
                  <span>
                    Last tick {timeFormat.format(new Date(lastRun.ranAt))}
                    <span className="text-muted-foreground"> ({lastRun.kind === "sync" ? "included a full sync" : "live check only"})</span>
                  </span>
                ) : (
                  <span>The scheduler has not run yet.</span>
                )}
              </div>
              <p className="text-muted-foreground">
                Every tick samples concurrent viewers for channels that are live right now, and every{" "}
                <strong className="font-medium text-foreground">{e.SYNC_INTERVAL_HOURS} hours</strong> it re-pulls every connection and stores a view-count snapshot
                per item. That history is what powers “new views in the last 24 h”.
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Run it</p>
              <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">npm run scheduler</pre>
              <p className="text-xs text-muted-foreground">
                Or point any cron at <code className="font-mono">POST {origin}/api/cron/tick</code> once a minute with{" "}
                <code className="font-mono">Authorization: Bearer $CRON_SECRET</code>
                {e.CRON_SECRET ? "." : " (CRON_SECRET is not set; required before deploying)."}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* AI */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">AI coach</h2>
        <Card data-reveal>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", coach.enabled ? "bg-good" : "bg-muted-foreground/40")} />
                {coach.enabled && coach.primary
                  ? `Enabled — ${coach.primary.label} (${coach.primary.model}) answers first${
                      coach.fallbacks.length ? `, then ${coach.fallbacks.map((f) => f.label).join(", ")}` : ""
                    }.`
                  : coach.hint}
              </div>
              <span className="text-xs text-muted-foreground">
                Structured JSON output, validated locally · only the analytics summary is sent, never tokens.
              </span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {providerConfigs().map((p) => (
                <li key={p.id} className="flex items-start gap-2 rounded-md border px-3 py-2">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", p.configured ? "bg-good" : "bg-muted-foreground/40")} />
                  <div>
                    <div className="font-medium">
                      {p.label} <span className="font-mono text-xs text-muted-foreground">{p.model}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.configured ? "configured" : `set ${{ gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", anthropic: "ANTHROPIC_API_KEY", ollama: "OLLAMA_URL" }[p.id]}`}
                      {" · "}
                      {p.note}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Order is controlled by <code className="font-mono">COACH_PROVIDER</code> (auto = Gemini → Groq → Anthropic → Ollama) and{" "}
              <code className="font-mono">COACH_FALLBACK</code>.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Rates */}
      <section id="rates" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Payout assumptions</h2>
          <p className="text-sm text-muted-foreground">
            Estimates use these bands wherever a platform doesn’t report income. Leave a field blank to keep the default; set only “mid” and the band scales with it.
          </p>
        </div>
        <form action={saveRatesAction}>
          <Card data-reveal className="py-0">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assumption</TableHead>
                    <TableHead className="w-28 text-right">Low</TableHead>
                    <TableHead className="w-28 text-right">Mid</TableHead>
                    <TableHead className="w-28 text-right">High</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {RATE_DEFINITIONS.map((def) => (
                    <TableRow key={def.key}>
                      <TableCell className="whitespace-normal">
                        <div className="flex items-center gap-2">
                          <PlatformBadge platform={def.platform} />
                          <span className="font-medium">{def.label}</span>
                          <span className="text-xs text-muted-foreground">{def.unit}</span>
                        </div>
                        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{def.description}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/80">Source: {def.source}</p>
                      </TableCell>
                      {(["low", "mid", "high"] as const).map((band) => {
                        const key = `${def.key}.${band}`;
                        const override = overrides[key];
                        return (
                          <TableCell key={band} className="align-top">
                            <Input
                              name={key}
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min={0}
                              defaultValue={override ?? ""}
                              placeholder={String(def[band])}
                              aria-label={`${def.label} ${band}`}
                              className={cn("text-right tabular-nums", override !== undefined && "border-foreground/40")}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <Separator />
            <CardFooter className="justify-between gap-2 py-4">
              <span className="text-xs text-muted-foreground">
                {Object.keys(overrides).length} override{Object.keys(overrides).length === 1 ? "" : "s"} active
              </span>
              <div className="flex gap-2">
                <Button type="submit" variant="ghost" formAction={resetRatesAction}>
                  Reset to defaults
                </Button>
                <Button type="submit">Save assumptions</Button>
              </div>
            </CardFooter>
          </Card>
        </form>
      </section>
    </Reveal>
  );
}
