import type { MediaItem } from "./media";

/**
 * Seleção manual de publicações do @a.casaaurea (sem widget automático).
 * Para cada post: baixe a imagem, salve em /public/images/instagram
 * e preencha `media.src` e `href` com o link da publicação.
 */
export type InstagramPost = { id: string; href: string; media: MediaItem };

const profile = "https://www.instagram.com/a.casaaurea";
const tones = ["sand", "walnut", "linen", "taupe", "limestone", "sand"] as const;

export const instagramPosts: InstagramPost[] = tones.map((tone, i) => ({
  id: `post-${i + 1}`,
  href: profile,
  media: { src: null, alt: "Publicação do Instagram da Casa Áurea", brief: `Post selecionado ${i + 1}`, tone },
}));
