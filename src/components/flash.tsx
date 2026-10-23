import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PLATFORM_LABEL, isPlatform } from "@/lib/platforms/types";
import type { SearchParams } from "./filter-links";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** One-shot messages carried in the query string after redirects. */
export function Flash({ params }: { params: SearchParams }) {
  const error = first(params.error);
  const connected = first(params.connected);
  const messages: string[] = [];
  if (connected && isPlatform(connected)) messages.push(`${PLATFORM_LABEL[connected]} connected and synced.`);
  if (first(params.synced)) messages.push("All connections synced.");
  if (first(params.demo) === "installed") messages.push("Demo channels installed. Everything you see is generated data.");
  if (first(params.demo) === "removed") messages.push("Demo channels removed.");
  if (first(params.disconnected)) messages.push("Connection removed along with its data.");
  if (first(params.rates) === "saved") messages.push("Payout assumptions saved.");
  if (first(params.rates) === "reset") messages.push("Payout assumptions reset to defaults.");
  if (first(params.experiment) === "started") messages.push("Experiment started. It is scored against your baseline after every sync.");
  if (first(params.experiment) === "closed") messages.push("Experiment closed.");
  if (first(params.experiment) === "reopened") messages.push("Experiment reopened.");
  if (first(params.experiment) === "deleted") messages.push("Experiment deleted.");

  if (!error && messages.length === 0) return null;
  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {messages.map((m) => (
        <Alert key={m}>
          <CheckCircle2 />
          <AlertTitle>{m}</AlertTitle>
        </Alert>
      ))}
    </div>
  );
}
