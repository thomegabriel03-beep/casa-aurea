/**
 * Configuração central da Casa Áurea.
 *
 * Regra do projeto: nada aqui é inventado. Tudo que ainda não foi confirmado
 * pela empresa está marcado com `confirmed: false` ou valor `null`,
 * e listado em PENDING_INFORMATION.md.
 */

/** Notas de conteúdo pendente: só aparecem quando ligadas de propósito (NEXT_PUBLIC_SHOW_PENDING=true). */
export const SHOW_PENDING = process.env.NEXT_PUBLIC_SHOW_PENDING === "true";

export const site = {
  name: "Casa Áurea",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.casaaurea.com.br", // PENDENTE: domínio oficial
  locale: "pt_BR",
  description:
    "Mobiliário, decoração e curadoria de interiores em Tijucas, SC. Um showroom para compor ambientes com identidade, com atendimento próximo do início ao fim.",

  founders: ["Rafa Müller", "Camila Santiago"] as const,
  showroomOpening: "2026-08-26", // inauguração divulgada

  address: {
    street: "Av. Valério Gomes, 42",
    district: "Centro",
    city: "Tijucas",
    state: "SC",
    stateName: "Santa Catarina",
    postalCode: null as string | null, // PENDENTE
    country: "BR",
  },

  contact: {
    // Somente dígitos, com DDI + DDD. Definido via .env.
    whatsapp: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "").replace(/\D/g, "") || null,
    email: null as string | null, // PENDENTE
    instagram: {
      handle: "@a.casaaurea",
      url: "https://www.instagram.com/a.casaaurea",
    },
  },

  /**
   * Horários encontrados preliminarmente. NÃO confirmados.
   * Enquanto `confirmed` for false, não entram no schema.org.
   */
  hours: {
    confirmed: false,
    rows: [
      { label: "Segunda a sexta", value: "09h–12h e 13h30–19h", days: ["Mo", "Tu", "We", "Th", "Fr"], ranges: [["09:00", "12:00"], ["13:30", "19:00"]] },
      { label: "Sábado", value: "09h–13h", days: ["Sa"], ranges: [["09:00", "13:00"]] },
    ],
  },

  legal: {
    companyName: null as string | null, // PENDENTE: razão social
    cnpj: null as string | null, // PENDENTE: não usar o CNPJ encontrado online sem confirmação
  },
} as const;

export const mapsQuery = encodeURIComponent(
  `${site.address.street}, ${site.address.district}, ${site.address.city} - ${site.address.state}`,
);
export const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`;
export const mapsEmbedUrl = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
