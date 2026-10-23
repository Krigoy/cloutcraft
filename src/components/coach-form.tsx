"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useActionState } from "react";
import { runCoachAction, type CoachActionState } from "@/app/coach/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL: CoachActionState = { status: "idle" };

export function CoachForm({
  windowDays,
  threadId,
  enabled,
  hasData,
  disabledReason,
  providerLabel,
}: {
  windowDays: number;
  /** Set when asking a follow-up inside an existing conversation. */
  threadId?: number;
  enabled: boolean;
  hasData: boolean;
  disabledReason?: string;
  providerLabel?: string;
}) {
  // On success the action redirects to the new turn itself; only errors come back as state.
  const [state, formAction, pending] = useActionState(runCoachAction, INITIAL);
  const followUp = threadId !== undefined;

  return (
    <form action={formAction} className="space-y-3" key={threadId ?? "new"}>
      <input type="hidden" name="window" value={windowDays} />
      {followUp && <input type="hidden" name="threadId" value={threadId} />}
      <div className="space-y-1.5">
        <Label htmlFor="notes">
          {followUp ? "Ask a follow-up" : "Ask the coach a question or set a goal (optional)"}
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={followUp ? 2 : 3}
          className="bg-background/70 text-[15px]"
          placeholder={
            followUp
              ? "e.g. “Which of those should I do first if I only have 6 hours a week?”, “Rework this around Twitch instead.”"
              : "e.g. “How do I get to 1M YouTube subscribers?”, “Should I drop Shorts?”, “I can only film two days a week — what matters most?”"
          }
          disabled={pending}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !enabled || !hasData}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pending ? "Thinking…" : followUp ? "Send follow-up" : "Generate growth plan"}
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
