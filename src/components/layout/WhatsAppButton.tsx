"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { genericMessage } from "@/lib/whatsapp";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";

/**
 * Acesso discreto à conversa: aparece só depois do hero,
 * em tom neutro, sem a bolha verde padrão.
 */
export function WhatsAppButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={cn(
        "fixed bottom-[max(1.3125rem,env(safe-area-inset-bottom))] right-[1.3125rem] z-20 transition-[opacity,transform] duration-500 ease-[var(--ease-quiet)] lg:right-8",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
      inert={!visible}
    >
      <WhatsAppLink
        message={genericMessage}
        source="floating"
        ariaLabel="Conversar com a Casa Áurea pelo WhatsApp"
        className="flex h-12 items-center gap-2.5 rounded-full border border-sand bg-limestone/95 px-4 text-[0.875rem] text-ink shadow-[0_8px_34px_-13px_rgb(35_30_26/0.35)] backdrop-blur transition-colors hover:bg-linen"
      >
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M20.5 11.6a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.6Z" />
        </svg>
        <span className="hidden sm:inline">Conversar</span>
      </WhatsAppLink>
    </div>
  );
}
