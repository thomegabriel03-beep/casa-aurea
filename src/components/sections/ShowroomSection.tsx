"use client";

import { site, mapsDirectionsUrl, mapsEmbedUrl, SHOW_PENDING } from "@/config/site";
import { showroomMedia } from "@/data/media";
import { track } from "@/lib/analytics";
import { Media } from "@/components/ui/Media";
import { DoorReveal } from "@/components/ui/DoorReveal";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { Pending } from "@/components/ui/Pending";

export function ShowroomSection() {
  const opening = formatDatePtBR(site.showroomOpening);

  return (
    <section id="showroom" aria-labelledby="showroom-title" className="section">
      <div className="wrap">
        <div className="grid gap-6 lg:grid-cols-[5fr_8fr] lg:items-end lg:gap-[5.5rem]">
          <div>
            <p className="chapter">Showroom</p>
            <h2 id="showroom-title" className="t-h2 mt-[1.3125rem]">
              Venha ver de perto, com calma.
            </h2>
          </div>
          <p className="t-lead max-w-[30em] text-ink/80">
            Textura, escala e conforto se entendem melhor ao vivo. No showroom, você percorre ambientes
            compostos e conversa com quem pensou cada um deles.
          </p>
        </div>

        <DoorReveal className="mt-[3.4375rem] lg:mt-[5.5rem]">
          <Media item={showroomMedia} sizes="100vw" className="aspect-[4/5] w-full sm:aspect-[16/9] lg:aspect-[21/9]" />
        </DoorReveal>

        <div className="mt-[3.4375rem] grid gap-[3.4375rem] lg:grid-cols-[5fr_8fr] lg:gap-[5.5rem]">
          <div className="grid gap-[2.125rem] sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <h3 className="t-caption">Endereço</h3>
              <address className="mt-2 font-serif text-[1.3125rem] not-italic leading-snug">
                {site.address.street}
                <br />
                {site.address.district}, {site.address.city} — {site.address.state}
              </address>
              <p className="t-caption mt-2">Aberto desde {opening}</p>
            </div>

            <div>
              <h3 className="t-caption">Horários</h3>
              <dl className="mt-2 space-y-1 text-[1.0625rem]">
                {site.hours.rows.map((r) => (
                  <div key={r.label} className="flex justify-between gap-6 border-b border-sand/70 py-2">
                    <dt>{r.label}</dt>
                    <dd className="text-right text-ink/75">{r.value}</dd>
                  </div>
                ))}
              </dl>
              {!site.hours.confirmed && SHOW_PENDING && <Pending>horários preliminares, confirmar antes da publicação.</Pending>}
            </div>

            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row lg:col-span-1">
              <WhatsAppLink
                message="Olá, Casa Áurea. Gostaria de visitar o showroom."
                source="showroom"
                className="btn btn-solid"
              >
                Visitar o showroom
              </WhatsAppLink>
              <a
                href={mapsDirectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("showroom_directions", { source: "showroom" })}
                className="btn btn-ghost"
              >
                Como chegar
              </a>
            </div>
            <p className="text-[0.9375rem]">
              <a
                href={site.contact.instagram.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("instagram_click", { source: "showroom" })}
                className="link-line"
              >
                {site.contact.instagram.handle} no Instagram
              </a>
            </p>
          </div>

          <div className="relative aspect-[4/3] w-full overflow-hidden bg-linen lg:aspect-auto lg:min-h-[26rem]">
            <iframe
              title={`Mapa: Casa Áurea, ${site.address.street}, ${site.address.city}`}
              src={mapsEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 h-full w-full border-0 [filter:grayscale(1)_contrast(0.92)_brightness(1.03)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** Formatação determinística (evita diferença de ICU entre servidor e navegador). */
function formatDatePtBR(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${months[m - 1]} de ${y}`;
}
