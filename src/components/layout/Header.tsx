"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { navigation } from "@/data/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solid = scrolled && !menuOpen;

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 transition-[background-color,color,border-color] duration-500 ease-[var(--ease-quiet)]",
          solid
            ? "border-b border-sand/60 bg-limestone/90 text-ink backdrop-blur-md"
            : "border-b border-transparent text-limestone",
        )}
      >
        <div className="wrap flex h-[4.25rem] items-center justify-between lg:h-[5.5rem]">
          <Link href="/" aria-label="Casa Áurea, página inicial" className="relative z-50">
            <Logo />
          </Link>

          <nav aria-label="Principal" className="hidden lg:block">
            <ul className="flex items-center gap-[2.125rem] text-[0.875rem]">
              {navigation.slice(0, 5).map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="link-line">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/#showroom" className="btn btn-ghost hidden min-h-[2.75rem] px-5 text-[0.875rem] lg:inline-flex">
              Visite o showroom
            </Link>
            <button
              type="button"
              className="relative z-50 -mr-3 flex h-11 items-center gap-3 px-3 text-[0.875rem] lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span>{menuOpen ? "Fechar" : "Menu"}</span>
              <span aria-hidden className="relative block h-[9px] w-[21px]">
                <span className={cn("absolute left-0 top-0 h-px w-full bg-current transition-transform duration-500", menuOpen && "translate-y-[4px] rotate-45")} />
                <span className={cn("absolute bottom-0 left-0 h-px w-full bg-current transition-transform duration-500", menuOpen && "-translate-y-[4px] -rotate-45")} />
              </span>
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
