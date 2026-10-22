import type { Metadata } from "next";
import { IntroPage } from "@/components/intro/intro-page";
import { listConnections } from "@/lib/db/repo";
import { getWorkspaceId } from "@/lib/session";

export const metadata: Metadata = {
  title: "CloutCraft — know what every video, Short and stream earns",
  description:
    "A self-hosted dashboard for YouTube, Twitch and TikTok creators: honest earnings ranges, view velocity, deterministic insights and an AI growth coach.",
};
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const connections = listConnections(await getWorkspaceId());
  return (
    <IntroPage
      hasConnections={connections.some((c) => !c.isDemo)}
      demoInstalled={connections.some((c) => c.isDemo)}
    />
  );
}
