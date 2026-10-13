import { testimonials } from "@/data/testimonials";

/** Só renderiza com depoimentos reais cadastrados em data/testimonials.ts. */
export function SocialProof() {
  if (testimonials.length === 0) return null;
  return (
    <section aria-labelledby="depoimentos-title" className="section">
      <div className="wrap">
        <p className="chapter">Quem já compôs com a gente</p>
        <h2 id="depoimentos-title" className="sr-only">Depoimentos</h2>
        <ul className="mt-[3.4375rem] grid gap-[3.4375rem] md:grid-cols-2">
          {testimonials.map((t) => (
            <li key={t.id}>
              <figure>
                <blockquote className="t-h3 font-light">“{t.quote}”</blockquote>
                <figcaption className="t-caption mt-4">
                  {t.author}
                  {t.context && `, ${t.context}`}
                  {t.source === "google" && " (avaliação no Google)"}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
