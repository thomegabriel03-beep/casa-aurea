"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { navigation } from "@/data/navigation";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { track } from "@/lib/analytics";

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      id="mobile-menu"
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      inert={!open}
      className={cn(
        "fixed inset-0 z-30 flex flex-col bg-walnut text-limestone lg:hidden",
        "transition-[clip-path] duration-700 ease-[var(--ease-door)]",
        open ? "[clip-path:inset(0)]" : "pointer-events-none [clip-path:inset(0_0_100%_0)]",
      )}
    >
      <nav aria-label="Menu móvel" className="wrap flex flex-1 flex-col justify-center pt-[4.25rem]">
        <ul className="space-y-1">
          {navigation.map((item, i) => (
            <li
              key={item.href}
              className={cn("transition-[opacity,transform] duration-700 ease-[var(--ease-quiet)]", open ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0")}
              style={{ transitionDelay: open ? `${160 + i * 55}ms` : "0ms" }}
            >
              <Link href={item.href} onClick={onClose} className="block py-2 font-serif text-[2.125rem] font-light leading-tight">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="wrap pb-[max(2.125rem,env(safe-area-inset-bottom))] text-[0.875rem] text-sand">
        <p>{site.address.street}, {site.address.city} — {site.address.state}</p>
        <a
          href={site.contact.instagram.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("instagram_click", { source: "mobile_menu" })}
          className="link-line mt-2 text-limestone"
        >
          {site.contact.instagram.handle}
        </a>
      </div>
    </div>
  );
}
