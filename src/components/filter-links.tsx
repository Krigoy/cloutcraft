import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SearchParams = Record<string, string | string[] | undefined>;

export function withParam(base: string, params: SearchParams, key: string, value: string | undefined): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === key) continue;
    const first = Array.isArray(v) ? v[0] : v;
    if (first) u.set(k, first);
  }
  if (value) u.set(key, value);
  const qs = u.toString();
  return qs ? `${base}?${qs}` : base;
}

/** A row of link "buttons" that set one query parameter; works without JavaScript. */
export function FilterLinks({
  label,
  base,
  params,
  param,
  options,
  current,
}: {
  label: string;
  base: string;
  params: SearchParams;
  param: string;
  options: { value: string | undefined; label: string }[];
  current: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
      {options.map((o) => {
        const active = (o.value ?? "") === (current ?? "");
        return (
          <Link
            key={o.label}
            href={withParam(base, params, param, o.value)}
            aria-current={active ? "true" : undefined}
            className={cn(buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm" }), "h-7 px-2.5 text-xs")}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export function WindowPicker({
  base,
  params,
  current,
  options,
}: {
  base: string;
  params: SearchParams;
  current: number;
  options: number[];
}) {
  return (
    <FilterLinks
      label="Period"
      base={base}
      params={params}
      param="window"
      current={String(current)}
      options={options.map((days) => ({ value: String(days), label: `${days} days` }))}
    />
  );
}
