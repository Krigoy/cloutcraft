import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block size-2.5 rounded-full bg-foreground" />
            <span className="hidden sm:inline">CloutCraft</span>
          </Link>
          {/* <Show> reads the request, so it sits behind Suspense (per Clerk's App Router guidance). */}
          <Suspense>
            <Show when="signed-in">
              <div className="min-w-0 flex-1">
                <NavLinks />
              </div>
            </Show>
          </Suspense>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Suspense>
            <Show when="signed-in">
              <UserButton />
            </Show>
            <Show when="signed-out">
              <SignInButton mode="redirect">
                <button type="button" className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Sign in
                </button>
              </SignInButton>
            </Show>
          </Suspense>
        </div>
      </div>
    </header>
  );
}
