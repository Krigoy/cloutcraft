"use client";

import { animate } from "animejs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "./motion/reduced-motion";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/content", label: "Content" },
  { href: "/coach", label: "Coach" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Primary navigation with a pill that slides to the active link. */
export function NavLinks() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const active = nav.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    if (!active) {
      pill.style.opacity = "0";
      return;
    }
    const x = active.offsetLeft;
    const width = active.offsetWidth;
    pill.style.opacity = "1";
    if (firstRender.current || prefersReducedMotion()) {
      firstRender.current = false;
      pill.style.transform = `translateX(${x}px)`;
      pill.style.width = `${width}px`;
      return;
    }
    const animation = animate(pill, {
      translateX: x,
      width,
      duration: 420,
      ease: "outQuint",
    });
    return () => {
      animation.cancel();
    };
  }, [pathname]);

  return (
    <nav ref={navRef} aria-label="Primary" className="relative flex items-center gap-1 overflow-x-auto">
      <span
        ref={pillRef}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-0 rounded-md bg-accent opacity-0"
      />
      {LINKS.map((link) => {
        const active = isActive(link.href, pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative z-10 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors hover:text-accent-foreground",
              active ? "text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
