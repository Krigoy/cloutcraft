import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConnectionSummary } from "@/lib/db/repo";

export function EmptyState({ connections }: { connections: ConnectionSummary[] }) {
  const failing = connections.filter((c) => c.lastSyncError);
  return (
    <Card className="mx-auto mt-10 max-w-xl">
      <CardHeader>
        <CardTitle>Nothing to show yet</CardTitle>
        <CardDescription>
          {connections.length === 0
            ? "Connect a platform to pull your real numbers, or install the demo channels to explore the dashboard first."
            : failing.length
              ? `Connected, but the last sync failed: ${failing.map((c) => `${c.platform}: ${c.lastSyncError}`).join("; ")}`
              : "Connected, but no content was found in the last 180 days."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <form action="/api/demo" method="post">
          <input type="hidden" name="action" value="install" />
          <Button type="submit">Install demo channels</Button>
        </form>
        <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
          Connect a platform
        </Link>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          What is this?
        </Link>
      </CardContent>
    </Card>
  );
}
