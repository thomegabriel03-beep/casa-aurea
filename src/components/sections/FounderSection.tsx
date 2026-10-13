import { site, SHOW_PENDING } from "@/config/site";
import { foundersMedia } from "@/data/media";
import { Media } from "@/components/ui/Media";
import { DoorReveal } from "@/components/ui/DoorReveal";

/**
 * Seção humana. Só contém o que foi divulgado: nomes dos fundadores,
 * a narrativa de um projeto construído com trabalho, planejamento e parceiros,
 * e a data de inauguração. Os blocos de história, visão, filosofia e nome
 * ficam como estrutura, visíveis apenas no modo de aprovação.
 */
const pendingBlocks = [
  { title: "Como tudo começou", note: "história da Casa Áurea, a partir de entrevista com Rafa e Camila." },
  { title: "O nome", note: "significado de “Áurea” segundo os fundadores." },
  { title: "O que nos guia", note: "visão e filosofia nas palavras dos fundadores." },
];

export function FounderSection() {
  const [a, b] = site.founders;
  return (
    <section id="historia" aria-labelledby="historia-title" className="section bg-linen">
      <div className="wrap grid gap-[3.4375rem] lg:grid-cols-[5fr_8fr] lg:gap-[5.5rem]">
        <DoorReveal>
          <Media item={foundersMedia} sizes="(min-width:1024px) 38vw, 100vw" className="aspect-[4/5] w-full" />
        </DoorReveal>

        <div className="lg:pt-[5.5rem]">
          <p className="chapter">Por trás da Casa Áurea</p>
          <h2 id="historia-title" className="t-h2 mt-[1.3125rem]">
            {a} e {b}
          </h2>
          <p className="t-lead mt-[2.125rem] max-w-[30em] text-ink/85">
            A Casa Áurea nasceu de um projeto construído com trabalho, planejamento e a participação de
            parceiros que acreditaram na ideia. Em agosto de 2026, o showroom abriu as portas em Tijucas.
          </p>

          {SHOW_PENDING && (
            <div className="mt-[3.4375rem] grid gap-6 border-t border-sand pt-[2.125rem] sm:grid-cols-3">
              {pendingBlocks.map((blk) => (
                <div key={blk.title}>
                  <h3 className="font-serif text-[1.3125rem]">{blk.title}</h3>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-taupe">
                    <span className="font-medium text-bronze">Pendente: </span>
                    {blk.note}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
