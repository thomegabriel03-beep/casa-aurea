import { SHOW_PENDING } from "@/config/site";
import type { ReactNode } from "react";

/** Nota de conteúdo pendente. Some quando NEXT_PUBLIC_SHOW_PENDING=false. */
export function Pending({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  if (!SHOW_PENDING) return null;
  return (
    <p
      className={
        "mt-5 border-l pl-3 text-[0.8125rem] leading-relaxed " +
        (tone === "dark" ? "border-sand/50 text-sand" : "border-bronze/60 text-taupe")
      }
    >
      <span className={tone === "dark" ? "font-medium text-linen" : "font-medium text-bronze"}>Pendente: </span>
      {children}
    </p>
  );
}
