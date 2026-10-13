/**
 * Camada única de eventos. Envia para GTM (dataLayer), GA4 (gtag)
 * e Meta Pixel (fbq) somente se estiverem carregados.
 */
export type AnalyticsEvent =
  | "click_whatsapp"
  | "lead_started"
  | "lead_completed"
  | "showroom_directions"
  | "instagram_click"
  | "professional_contact";

type Params = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

const metaStandard: Partial<Record<AnalyticsEvent, string>> = {
  lead_completed: "Lead",
  click_whatsapp: "Contact",
  professional_contact: "Contact",
  showroom_directions: "FindLocation",
};

export function track(event: AnalyticsEvent, params: Params = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer?.push({ event, ...params });
  window.gtag?.("event", event, params);
  const meta = metaStandard[event];
  if (meta) window.fbq?.("track", meta, params);
  else window.fbq?.("trackCustom", event, params);
  if (process.env.NODE_ENV !== "production") console.info("[analytics]", event, params);
}
