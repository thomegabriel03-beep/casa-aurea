import { consultingMedia } from "@/data/media";
import { Media } from "@/components/ui/Media";
import { DoorReveal } from "@/components/ui/DoorReveal";
import { Pending } from "@/components/ui/Pending";
import { LeadTrigger } from "@/components/lead/LeadFormProvider";

/** O que a composição leva em conta. Não descreve etapas de serviço (ainda não confirmadas). */
const considerations = [
  { title: "O espaço", text: "Proporções, circulação e luz: o que o ambiente pede antes de qualquer peça." },
  { title: "A rotina", text: "Como a casa é usada no dia a dia, quem recebe, quem descansa, quem trabalha ali." },
  { title: "O estilo", text: "Referências, memórias e objetos que já fazem parte da sua história." },
];

export function ConsultingSection() {
  return (
    <section id="assessoria" aria-labelledby="assessoria-title" className="section bg-walnut text-limestone">
      <div className="wrap grid gap-[3.4375rem] lg:grid-cols-[8fr_5fr] lg:gap-[5.5rem]">
        <div>
          <p className="chapter text-sand">Assessoria de ambientes</p>
          <h2 id="assessoria-title" className="t-display mt-[1.3125rem]">
            Seu espaço.
            <br />
            Nosso olhar.
          </h2>

          <div className="mt-[3.4375rem] max-w-[34em]">
            <p className="t-h3">Você não precisa escolher cada peça sozinho.</p>
            <p className="t-lead mt-[1.3125rem] text-limestone/80">
              A Casa Áurea ajuda você a compor um ambiente coerente com o seu espaço, o seu estilo e a
              sua forma de viver. Do sofá ao objeto sobre a mesa, as escolhas passam a conversar entre si.
            </p>
          </div>

          <dl className="mt-[3.4375rem] grid gap-8 border-t border-limestone/15 pt-[2.125rem] sm:grid-cols-3 sm:gap-[2.125rem]">
            {considerations.map((c) => (
              <div key={c.title}>
                <dt className="font-serif text-[1.3125rem]">{c.title}</dt>
                <dd className="mt-2 text-[0.9375rem] leading-relaxed text-limestone/70">{c.text}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-[3.4375rem]">
            <LeadTrigger source="consulting" className="btn btn-light w-full sm:w-auto">
              Quero transformar meu ambiente
            </LeadTrigger>
            <Pending tone="dark">
              formato da assessoria (gratuita ou paga, visita ao imóvel, medição, projeto 3D, profissionais internos). Nada disso é afirmado no site até a confirmação.
            </Pending>
          </div>
        </div>

        <DoorReveal className="self-end">
          <Media item={consultingMedia} sizes="(min-width:1024px) 36vw, 100vw" className="aspect-[4/5] w-full lg:aspect-[5/8]" />
        </DoorReveal>
      </div>
    </section>
  );
}
