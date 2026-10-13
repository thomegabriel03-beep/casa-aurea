import { site } from "@/config/site";

export type LeadData = {
  name: string;
  phone: string;
  city: string;
  environment: string;
  momentPhrase: string;
  message: string;
};

export function buildLeadMessage(d: LeadData) {
  const lines = [
    "Olá, Casa Áurea.",
    "",
    `Meu nome é ${d.name.trim()}.`,
    "",
    `Estou buscando atendimento para: ${d.environment.toLowerCase()}.`,
    "",
    `Estou ${d.momentPhrase}.`,
    "",
    `Minha cidade é ${d.city.trim()}.`,
    "",
    "Gostaria de conversar sobre a composição do meu ambiente.",
  ];
  if (d.message.trim()) lines.push("", d.message.trim());
  return lines.join("\n");
}

export const genericMessage =
  "Olá, Casa Áurea. Gostaria de conversar com a equipe.";

export const professionalMessage =
  "Olá, Casa Áurea. Sou profissional de arquitetura/interiores e gostaria de conversar sobre um projeto.";

/** Retorna null quando o número oficial ainda não foi configurado. */
export function whatsappUrl(text: string): string | null {
  const n = site.contact.whatsapp;
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function formatBrPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
