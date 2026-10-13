/**
 * Um item de mídia. Enquanto `src` for null, o componente <Media>
 * renderiza um placeholder tonal claramente identificado.
 * Ao receber as fotos: salve em /public/images e preencha `src`.
 */
export type MediaItem = {
  src: string | null;
  alt: string;
  /** Descrição do que deve ser fotografado — aparece no placeholder. */
  brief: string;
  /** Tom do placeholder (apenas enquanto não houver foto). */
  tone?: "limestone" | "linen" | "sand" | "taupe" | "walnut";
  width?: number;
  height?: number;
};

export const heroMedia: MediaItem = {
  src: null, // ex.: "/images/hero-showroom.jpg"
  alt: "Ambiente de estar composto no showroom da Casa Áurea, em Tijucas",
  brief: "Fotografia ampla e arquitetônica do showroom, luz natural, horizontal",
  tone: "walnut",
};

export const manifestoMedia: MediaItem = {
  src: null,
  alt: "Detalhe de materiais e texturas em uma composição da Casa Áurea",
  brief: "Detalhe de textura: madeira, tecido, pedra ou luz sobre um objeto",
  tone: "sand",
};

export const consultingMedia: MediaItem = {
  src: null,
  alt: "Atendimento de composição de ambiente no showroom da Casa Áurea",
  brief: "Mãos escolhendo amostras, tecidos ou acabamentos durante um atendimento",
  tone: "taupe",
};

export const foundersMedia: MediaItem = {
  src: null,
  alt: "Rafa Müller e Camila Santiago, fundadores da Casa Áurea",
  brief: "Retrato de Rafa Müller e Camila Santiago no showroom",
  tone: "linen",
};

export const showroomMedia: MediaItem = {
  src: null,
  alt: "Vista do showroom da Casa Áurea na Av. Valério Gomes, em Tijucas",
  brief: "Vista ampla do showroom ou da fachada, horizontal",
  tone: "limestone",
};

export const professionalsMedia: MediaItem = {
  src: null,
  alt: "Detalhe de mobiliário e acabamentos no showroom da Casa Áurea",
  brief: "Detalhe de acabamento, junção ou material de uma peça",
  tone: "walnut",
};
