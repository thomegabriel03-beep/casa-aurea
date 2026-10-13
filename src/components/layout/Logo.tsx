import { cn } from "@/lib/cn";

/**
 * Wordmark provisório. PENDENTE: substituir pelo logo oficial em SVG
 * (salvar em /public/brand/logo.svg e trocar este componente por <img> ou SVG inline).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif text-[1.3125rem] font-normal leading-none tracking-[0.01em]", className)}>
      Casa Áurea
    </span>
  );
}
