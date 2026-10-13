import { heroMedia } from "@/data/media";
import { site } from "@/config/site";
import { genericMessage } from "@/lib/whatsapp";
import { Media } from "@/components/ui/Media";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative flex min-h-[40rem] items-end overflow-hidden bg-walnut text-limestone h-[100svh] lg:min-h-[46rem]">
      <div className="absolute inset-0">
        <Media item={heroMedia} sizes="100vw" priority className="h-full w-full" imgClassName="parallax" captionClassName="left-[1.3125rem] right-[1.3125rem] top-[5.5rem] lg:left-auto lg:right-[clamp(1.3125rem,5vw,5.5rem)] lg:top-[7rem] lg:max-w-[20rem] lg:text-right" />
        {/* véu para legibilidade, mais denso na base, onde está o texto */}
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgb(35_30_26/0.35)_0%,transparent_30%,transparent_45%,rgb(35_30_26/0.72)_100%)]" />
      </div>

      <div className="wrap relative pb-[3.4375rem] lg:pb-[5.5rem]">
        {/* coluna de texto limitada a 61.8% no desktop: a divisão áurea */}
        <div className="lg:max-w-[61.8%]">
          <h1 id="hero-title" className="t-display hero-in">
            Sua casa não precisa parecer um catálogo. Precisa parecer com você.
          </h1>
          <p className="t-lead hero-in hero-in-2 mt-[1.3125rem] max-w-[30em] text-limestone/85">
            Mobiliário, decoração e curadoria de ambientes para espaços que carregam a identidade de quem vive neles.
          </p>
          <div className="hero-in hero-in-3 mt-[2.125rem] flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <a href="#casa-aurea" className="btn btn-light">
              Conheça a Casa Áurea
            </a>
            <WhatsAppLink message={genericMessage} source="hero" className="btn btn-ghost">
              Fale com nossa equipe
            </WhatsAppLink>
          </div>
        </div>

        <p className="t-caption absolute bottom-[5.5rem] right-[clamp(1.3125rem,5vw,5.5rem)] hidden text-right text-limestone/70 lg:block">
          Showroom<br />
          {site.address.street}, {site.address.city}
        </p>
      </div>
    </section>
  );
}
