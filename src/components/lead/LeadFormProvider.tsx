"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { track } from "@/lib/analytics";

// O formulário só é baixado quando alguém o abre (code splitting).
const LeadDialog = dynamic(() => import("./LeadDialog").then((m) => m.LeadDialog), { ssr: false });

type Ctx = { open: (source: string) => void };
const LeadFormContext = createContext<Ctx>({ open: () => {} });

export function LeadFormProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; source: string; key: number }>({ open: false, source: "", key: 0 });

  const open = useCallback((source: string) => {
    track("lead_started", { source });
    setState((s) => ({ open: true, source, key: s.key + 1 }));
  }, []);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  return (
    <LeadFormContext.Provider value={{ open }}>
      {children}
      {state.open && <LeadDialog key={state.key} source={state.source} onClose={close} />}
    </LeadFormContext.Provider>
  );
}

export const useLeadForm = () => useContext(LeadFormContext);

/** Botão que abre a experiência de qualificação. */
export function LeadTrigger({ source, className, children }: { source: string; className?: string; children: ReactNode }) {
  const { open } = useLeadForm();
  return (
    <button type="button" className={className} onClick={() => open(source)} aria-haspopup="dialog">
      {children}
    </button>
  );
}
