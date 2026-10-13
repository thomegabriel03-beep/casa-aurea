"use client";

import { useMemo, useState } from "react";
import { environments, type Environment } from "@/data/environments";
import { Media } from "@/components/ui/Media";
import { DoorReveal } from "@/components/ui/DoorReveal";
import { cn } from "@/lib/cn";

const aspect: Record<Environment["shape"], string> = {
  tall: "aspect-[5/8]",
  wide: "aspect-[8/5]",
  square: "aspect-square",
};

export function AmbientGallery() {
  const categories = useMemo(
    () => Array.from(new Set(environments.map((e) => e.category).filter(Boolean))) as string[],
    [],
  );
  const [filter, setFilter] = useState<string | null>(null);
  const items = filter ? environments.filter((e) => e.category === filter) : environments;

  // Grid editorial: coluna estreita (5) e larga (8), com a larga deslocada para baixo.
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);

  return (
    <section id="ambientes" aria-labelledby="ambientes-title" className="section bg-linen">
      <div className="wrap">
        <div className="grid gap-6 lg:grid-cols-[5fr_8fr] lg:items-end lg:gap-[5.5rem]">
          <div>
            <p className="chapter">Ambientes</p>
            <h2 id="ambientes-title" className="t-h2 mt-[1.3125rem]">
              Espaços com identidade
            </h2>
          </div>
          <p className="t-body max-w-[32em] text-ink/75">
            Composições do nosso showroom em Tijucas: peças pensadas em conjunto, na escala e na luz de um ambiente real.
          </p>
        </div>

        {categories.length > 1 && (
          <div role="group" aria-label="Filtrar ambientes" className="mt-[2.125rem] flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem]">
            {[null, ...categories].map((c) => (
              <button
                key={c ?? "all"}
                type="button"
                aria-pressed={filter === c}
                onClick={() => setFilter(c)}
                className={cn("py-1 transition-colors", filter === c ? "text-ink underline underline-offset-8" : "text-taupe hover:text-ink")}
              >
                {c ?? "Todos"}
              </button>
            ))}
          </div>
        )}

        {/* Mobile: faixa horizontal com snap, para não empilhar seções gigantes */}
        <ul className="-mx-[1.3125rem] mt-[3.4375rem] flex snap-x snap-mandatory gap-[0.8125rem] overflow-x-auto px-[1.3125rem] pb-4 [scrollbar-width:none] md:hidden">
          {items.map((env) => (
            <li key={env.id} className="w-[82vw] max-w-[22rem] shrink-0 snap-start">
              <Figure env={env} className="aspect-[4/5]" sizes="82vw" />
            </li>
          ))}
        </ul>

        <div className="mt-[5.5rem] hidden gap-[3.4375rem] md:grid md:grid-cols-[5fr_8fr] lg:gap-[5.5rem]">
          <div className="space-y-[5.5rem]">
            {left.map((env) => (
              <Figure key={env.id} env={env} className={aspect[env.shape]} sizes="(min-width:768px) 38vw, 100vw" />
            ))}
          </div>
          <div className="space-y-[5.5rem] md:pt-[9rem]">
            {right.map((env) => (
              <Figure key={env.id} env={env} className={aspect[env.shape]} sizes="(min-width:768px) 62vw, 100vw" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Figure({ env, className, sizes }: { env: Environment; className: string; sizes: string }) {
  return (
    <figure>
      <DoorReveal>
        <Media item={env.media} sizes={sizes} className={cn("w-full", className)} />
      </DoorReveal>
      <figcaption className="mt-[0.8125rem] flex items-baseline justify-between gap-4">
        <span className="font-serif text-[1.3125rem]">{env.title}</span>
        <span className="t-caption">{env.category ?? env.caption}</span>
      </figcaption>
    </figure>
  );
}
