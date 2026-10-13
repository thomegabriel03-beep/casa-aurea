import type { MediaItem } from "./media";

/**
 * Composições exibidas na seção Ambientes.
 *
 * Ainda não recebemos material real, então não cadastramos categorias
 * (sala, dormitório etc.) como definitivas. `category` fica null até
 * existir foto real daquele tipo de ambiente. Os filtros só aparecem
 * quando houver 2+ categorias distintas preenchidas.
 */
export type Environment = {
  id: string;
  title: string;
  category: string | null;
  caption: string;
  media: MediaItem;
  /** Proporção de exibição no grid editorial. */
  shape: "tall" | "wide" | "square";
};

export const environments: Environment[] = [
  {
    id: "composicao-1",
    title: "Composição I",
    category: null,
    caption: "Showroom Casa Áurea, Tijucas",
    shape: "tall",
    media: { src: null, alt: "Composição de ambiente no showroom da Casa Áurea", brief: "Ambiente completo do showroom, vertical", tone: "sand" },
  },
  {
    id: "composicao-2",
    title: "Composição II",
    category: null,
    caption: "Showroom Casa Áurea, Tijucas",
    shape: "wide",
    media: { src: null, alt: "Composição de ambiente no showroom da Casa Áurea", brief: "Ambiente do showroom, horizontal", tone: "taupe" },
  },
  {
    id: "composicao-3",
    title: "Composição III",
    category: null,
    caption: "Showroom Casa Áurea, Tijucas",
    shape: "square",
    media: { src: null, alt: "Detalhe de composição no showroom da Casa Áurea", brief: "Detalhe de uma composição: mesa, luz, objetos", tone: "linen" },
  },
  {
    id: "composicao-4",
    title: "Composição IV",
    category: null,
    caption: "Showroom Casa Áurea, Tijucas",
    shape: "tall",
    media: { src: null, alt: "Composição de ambiente no showroom da Casa Áurea", brief: "Ambiente do showroom, vertical", tone: "walnut" },
  },
];
