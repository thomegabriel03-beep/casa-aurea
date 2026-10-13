import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="conteudo" className="wrap py-[3.4375rem]">
      <Link href="/" aria-label="Voltar para a página inicial">
        <Logo />
      </Link>
      <h1 className="t-h2 mt-[5.5rem]">{title}</h1>
      <div className="t-body mt-[2.125rem] max-w-[38em] space-y-5 text-ink/85">{children}</div>
      <p className="mt-[3.4375rem]">
        <Link href="/" className="link-line">Voltar ao site</Link>
      </p>
    </main>
  );
}
