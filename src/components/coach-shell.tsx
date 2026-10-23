import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/reveal";

/**
 * Three-panel layout shared by the coach pages: conversations sidebar pinned
 * to the left edge, the main column, and a sticky evidence/tools column on
 * wide screens. Opts out of the root layout's centred container.
 */
export function CoachShell({ sidebar, aside, children }: { sidebar: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div data-full-bleed>
      <Reveal>
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside
            data-reveal
            className="max-h-80 overflow-hidden border-b bg-card/40 p-3 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:max-h-none lg:border-r lg:border-b-0 lg:p-4"
          >
            {sidebar}
          </aside>

          <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl space-y-6">{children}</div>
          </div>

          {aside !== undefined && (
            <aside className="border-t p-4 xl:sticky xl:top-14 xl:h-[calc(100vh-3.5rem)] xl:overflow-y-auto xl:border-t-0 xl:border-l">{aside}</aside>
          )}
        </div>
      </Reveal>
    </div>
  );
}
