"use client";

import type { ReactNode } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import { whatsappUrl } from "@/lib/whatsapp";
import { useLeadForm } from "@/components/lead/LeadFormProvider";

type Props = {
  message: string;
  className?: string;
  children: ReactNode;
  event?: AnalyticsEvent;
  source: string;
  ariaLabel?: string;
};

/**
 * Link para o WhatsApp oficial. Enquanto o número não estiver configurado,
 * abre o formulário de atendimento em vez de gerar um link quebrado.
 */
export function WhatsAppLink({ message, className, children, event = "click_whatsapp", source, ariaLabel }: Props) {
  const url = whatsappUrl(message);
  const { open } = useLeadForm();

  if (!url) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        className={className}
        onClick={() => {
          track(event, { source });
          open(source);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={className}
      onClick={() => track(event, { source })}
    >
      {children}
    </a>
  );
}
