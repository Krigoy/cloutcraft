import Link from "next/link";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block size-2.5 rounded-full bg-foreground" />
            <span className="hidden sm:inline">Creator Earnings</span>
          </Link>
          <div className="min-w-0 flex-1">
            <NavLinks />
          </div>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
