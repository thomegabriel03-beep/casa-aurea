/** Mensagem contextual do botão "Consultar peça". O número vem da configuração central (site.ts). */
export function consultPieceMessage(p: { name: string; publicCode?: string | null }, url?: string): string {
  const lines = ["Olá, Casa Áurea.", "", "Gostaria de saber mais sobre esta peça:", "", p.name];
  if (p.publicCode) lines.push(`Código: ${p.publicCode}`);
  if (url) lines.push("", url);
  lines.push("", "Quero entender disponibilidade e opções.");
  return lines.join("\n");
}

export const whatsappUrl = (number: string, text: string) =>
  `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
