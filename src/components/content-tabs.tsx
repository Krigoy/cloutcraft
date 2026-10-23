import { Film, Radio } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "uploads", label: "Uploads", href: "/content", icon: Film },
  { id: "streams", label: "Streams", href: "/content/streams", icon: Radio },
] as const;

/** Segmented toggle between the uploads table and the streams view. */
export function ContentTabs({ active, windowDays }: { active: (typeof TABS)[number]["id"]; windowDays: number }) {
  return (
    <nav aria-label="Content views" className="inline-flex h-8 items-center rounded-lg bg-muted p-[3px]">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={`${t.href}?window=${windowDays}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors",
              isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
