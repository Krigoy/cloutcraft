import { MessageSquare, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { CoachThreadSummary } from "@/lib/db/repo";
import { cn } from "@/lib/utils";

function groupLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return "Earlier";
}

const timeShort = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** Past conversations, newest first, grouped by day. */
export function CoachSidebar({
  threads,
  activeThreadId,
  windowDays,
  now,
}: {
  threads: CoachThreadSummary[];
  activeThreadId: number | null;
  windowDays: number;
  now: Date;
}) {
  const groups: { label: string; items: CoachThreadSummary[] }[] = [];
  for (const t of threads) {
    const label = groupLabel(t.lastAt, now);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(t);
    else groups.push({ label, items: [t] });
  }

  return (
    <nav aria-label="Past conversations" className="flex h-full flex-col gap-3">
      <Link
        href={`/coach?window=${windowDays}&thread=new`}
        className={cn(buttonVariants({ variant: activeThreadId === null ? "default" : "outline" }), "w-full justify-start gap-2")}
      >
        <Plus className="size-4" />
        New conversation
      </Link>

      {threads.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">Your conversations with the coach will appear here.</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g.label}</div>
              <ul className="space-y-0.5">
                {g.items.map((t) => {
                  const active = t.threadId === activeThreadId;
                  const isToday = groupLabel(t.lastAt, now) === "Today";
                  return (
                    <li key={t.threadId} className="group/thread relative">
                      <Link
                        href={`/coach?window=${windowDays}&thread=${t.threadId}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "block rounded-lg px-2 py-2 pr-8 text-sm transition-colors hover:bg-accent",
                          active ? "bg-accent" : "text-muted-foreground",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <MessageSquare className="mt-0.5 size-3.5 shrink-0 opacity-70" />
                          <div className="min-w-0">
                            <div className={cn("truncate", active && "font-medium text-foreground")}>
                              {t.title || "General review"}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {t.turns} {t.turns === 1 ? "turn" : "turns"} · {isToday ? timeShort.format(new Date(t.lastAt)) : dateShort.format(new Date(t.lastAt))}
                            </div>
                          </div>
                        </div>
                      </Link>
                      <form
                        action={`/api/coach/threads/${t.threadId}/delete`}
                        method="post"
                        className="absolute top-1.5 right-1 opacity-0 transition-opacity group-hover/thread:opacity-100 focus-within:opacity-100"
                      >
                        <input type="hidden" name="window" value={windowDays} />
                        <button
                          type="submit"
                          aria-label={`Delete conversation “${t.title || "General review"}”`}
                          className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
