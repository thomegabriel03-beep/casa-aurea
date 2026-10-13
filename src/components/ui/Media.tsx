import Image from "next/image";
import { SHOW_PENDING } from "@/config/site";
import type { MediaItem } from "@/data/media";
import { cn } from "@/lib/cn";

type Props = {
  item: MediaItem;
  /** `sizes` para imagens responsivas — essencial para performance. */
  sizes: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  /** Posição da legenda de pendência no placeholder. */
  captionClassName?: string;
};

/**
 * Renderiza a fotografia (next/image: AVIF/WebP, responsiva, lazy por padrão)
 * ou — enquanto `src` for null — um placeholder tonal marcado como pendente.
 * O contêiner pai define a proporção.
 */
export function Media({ item, sizes, priority, className, imgClassName, captionClassName }: Props) {
  if (item.src) {
    return (
      <div className={cn("relative overflow-hidden bg-linen", className)}>
        <Image
          src={item.src}
          alt={item.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn("object-cover", imgClassName)}
        />
      </div>
    );
  }

  return (
    <div role="img" aria-label={item.alt} className={cn("ph", `ph-${item.tone ?? "linen"}`, className)}>
      <div className={cn("absolute inset-0", imgClassName)} />
      {SHOW_PENDING && (
        <span className={cn("absolute text-[0.6875rem] leading-snug tracking-[0.02em] text-white/80", captionClassName ?? "bottom-3 left-3 right-3")}>
          Fotografia pendente: {item.brief}
        </span>
      )}
    </div>
  );
}
