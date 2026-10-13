/**
 * Depoimentos reais apenas. A seção de prova social não é renderizada
 * enquanto esta lista estiver vazia.
 */
export type Testimonial = {
  id: string;
  quote: string;
  author: string;
  context?: string; // ex.: "Apartamento em Tijucas"
  source: "google" | "direto" | "instagram";
};

export const testimonials: Testimonial[] = [];
