import { activeCollections } from "@/data/collections";
import { Media } from "@/components/ui/Media";
import { DoorReveal } from "@/components/ui/DoorReveal";
import { Pending } from "@/components/ui/Pending";
import { cn } from "@/lib/cn";

export function ProductCategories() {
  const n = activeCollections.length;
  if (n === 0) return null;

  return (
    <section id="curadoria" aria-labelledby="curadoria-title" className="section">
      <div className="wrap">
        <div className="grid gap-6 lg:grid-cols-[5fr_8fr] lg:gap-[5.5rem]">
          <div>
            <p className="chapter">Curadoria</p>
            <h2 id="curadoria-title" className="t-h2 mt-[1.3125rem]">
              Mobiliário & decoração
            </h2>
          </div>
          <div className="lg:pt-[3.4375rem]">
            <p className="t-lead max-w-[30em] text-ink/85">
              Uma seleção feita para compor, não para acumular. Cada peça é escolhida pelo desenho,
              pelo material e pela forma como convive com o restante da casa.
            </p>
            <Pending>marcas comercializadas e confirmação das categorias de iluminação, cortinas, persianas e cama, mesa e banho (desativadas em data/collections.ts).</Pending>
          </div>
        </div>

        <ul
          className={cn(
            "mt-[3.4375rem] grid gap-x-[2.125rem] gap-y-[3.4375rem] lg:mt-[5.5rem]",
            n >= 2 && "md:grid-cols-2",
            n >= 3 && "lg:grid-cols-3",
          )}
        >
          {activeCollections.map((c, i) => (
            <li key={c.id} className={cn(n === 2 && i === 1 && "md:mt-[9rem]")}>
              <DoorReveal>
                <Media
                  item={c.media}
                  sizes={n >= 3 ? "(min-width:1024px) 31vw, (min-width:768px) 48vw, 100vw" : "(min-width:768px) 48vw, 100vw"}
                  className={cn("w-full", n === 2 ? "aspect-[4/5]" : "aspect-[5/8]")}
                />
              </DoorReveal>
              <h3 className="t-h3 mt-[1.3125rem]">{c.title}</h3>
              <p className="t-body mt-2 max-w-[26em] text-ink/70">{c.description}</p>
            </li>
          ))}
        </ul>

        <p className="mt-[3.4375rem] text-[0.9375rem]">
          <a href="#showroom" className="link-line">
            Conheça a seleção completa no showroom
          </a>
        </p>
      </div>
    </section>
  );
}
