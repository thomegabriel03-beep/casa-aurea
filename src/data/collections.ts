import type { MediaItem } from "./media";

/**
 * Categorias de curadoria. Para ativar uma categoria, mude `active` para true.
 * `confirmed` indica se a Casa Áurea confirmou que comercializa a categoria.
 * Só categorias confirmadas devem ir para produção com `active: true`.
 */
export type Collection = {
  id: string;
  title: string;
  description: string;
  active: boolean;
  confirmed: boolean;
  media: MediaItem;
};

export const collections: Collection[] = [
  {
    id: "mobiliario",
    title: "Mobiliário",
    description: "Peças para estar, receber, trabalhar e descansar, escolhidas pelo desenho, pelo conforto e pela forma como envelhecem bem.",
    active: true,
    confirmed: true, // segmento divulgado pela marca
    media: { src: null, alt: "Mobiliário em composição no showroom da Casa Áurea", brief: "Sofá, poltrona ou mesa em ambiente", tone: "taupe" },
  },
  {
    id: "decoracao",
    title: "Decoração",
    description: "Objetos, texturas e acabamentos que dão camada, memória e personalidade ao espaço.",
    active: true,
    confirmed: true, // segmento divulgado pela marca
    media: { src: null, alt: "Objetos decorativos em composição no showroom da Casa Áurea", brief: "Objetos decorativos sobre aparador ou estante", tone: "sand" },
  },
  {
    id: "iluminacao",
    title: "Iluminação",
    description: "Luminárias que desenham a luz do ambiente ao longo do dia.",
    active: false,
    confirmed: false, // PENDENTE
    media: { src: null, alt: "Iluminação decorativa", brief: "Luminária acesa em ambiente", tone: "walnut" },
  },
  {
    id: "cortinas-persianas",
    title: "Cortinas e persianas",
    description: "Tecidos e sistemas para controlar luz, privacidade e acústica.",
    active: false,
    confirmed: false, // PENDENTE
    media: { src: null, alt: "Cortinas em ambiente", brief: "Cortina com luz natural atravessando", tone: "linen" },
  },
  {
    id: "cama-mesa-banho",
    title: "Cama, mesa e banho",
    description: "Têxteis que completam o cotidiano da casa.",
    active: false,
    confirmed: false, // PENDENTE
    media: { src: null, alt: "Têxteis de cama", brief: "Cama posta com roupa de cama", tone: "limestone" },
  },
];

export const activeCollections = collections.filter((c) => c.active);
