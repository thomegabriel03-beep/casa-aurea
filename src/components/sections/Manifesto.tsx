import { manifestoMedia } from "@/data/media";
import { Media } from "@/components/ui/Media";
import { DoorReveal } from "@/components/ui/DoorReveal";

export function Manifesto() {
  return (
    <section id="casa-aurea" aria-labelledby="manifesto-title" className="section">
      <div className="wrap grid gap-[3.4375rem] lg:grid-cols-[5fr_8fr] lg:gap-[5.5rem]">
        <div className="order-2 lg:order-1">
          <p className="chapter">Manifesto</p>
          <DoorReveal className="mt-[2.125rem] hidden lg:block">
            <Media item={manifestoMedia} sizes="(min-width:1024px) 34vw, 100vw" className="aspect-[5/8] w-full max-w-[26rem]" />
          </DoorReveal>
        </div>

        <div className="order-1 lg:order-2 lg:pt-[5.5rem]">
          <h2 id="manifesto-title" className="t-h2 max-w-[14em]">
            Cada ambiente carrega uma história.
          </h2>
          <div className="t-lead mt-[2.125rem] max-w-[32em] space-y-[1.3125rem] text-ink/85">
            <p>
              Texturas, formas, materiais e objetos constroem mais do que a estética de um espaço.
              Constroem a sensação de chegar em casa.
            </p>
            <p>
              Na Casa Áurea, mobiliário e decoração passam por um olhar de curadoria. Cada peça é
              pensada em relação ao espaço, à luz e, principalmente, a quem vai viver ali.
            </p>
            <p>O resultado não é uma vitrine. É um lugar que você reconhece como seu.</p>
          </div>
          <DoorReveal className="mt-[3.4375rem] lg:hidden">
            <Media item={manifestoMedia} sizes="100vw" className="aspect-[4/5] w-full" />
          </DoorReveal>
        </div>
      </div>
    </section>
  );
}
