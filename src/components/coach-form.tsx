"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { runCoachAction, type CoachActionState } from "@/app/coach/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL: CoachActionState = { status: "idle" };

export function CoachForm({
  windowDays,
  enabled,
  hasData,
  disabledReason,
  providerLabel,
}: {
  windowDays: number;
  enabled: boolean;
  hasData: boolean;
  disabledReason?: string;
  providerLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(runCoachAction, INITIAL);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "ok" && state.runId) {
      router.replace(`/coach?window=${windowDays}&run=${state.runId}`);
    }
  }, [state, router, windowDays]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="window" value={windowDays} />
      <div className="space-y-1.5">
        <Label htmlFor="notes">Ask the coach a question or set a goal (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="e.g. “How do I get to 1M YouTube subscribers?”, “Should I drop Shorts?”, “I can only film two days a week — what matters most?”"
          disabled={pending}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !enabled || !hasData}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pending ? "Analysing your last " + windowDays + " days…" : "Generate growth plan"}
        </Button>
        {!enabled && <span className="text-sm text-muted-foreground">{disabledReason}</span>}
        {enabled && !pending && (
          <span className="text-xs text-muted-foreground">
            Usually 20–60 seconds.{providerLabel ? ` Uses ${providerLabel}.` : ""}
          </span>
        )}
      </div>
      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t generate a plan</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
