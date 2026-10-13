import { professionalsMedia } from "@/data/media";
import { professionalMessage } from "@/lib/whatsapp";
import { Media } from "@/components/ui/Media";
import { DoorReveal } from "@/components/ui/DoorReveal";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { Pending } from "@/components/ui/Pending";

export function ProfessionalSection() {
  return (
    <section id="profissionais" aria-labelledby="profissionais-title" className="section">
      <div className="wrap grid items-center gap-[3.4375rem] md:grid-cols-[5fr_8fr] lg:gap-[5.5rem]">
        <DoorReveal className="order-2 md:order-1">
          <Media item={professionalsMedia} sizes="(min-width:768px) 38vw, 100vw" className="aspect-square w-full md:aspect-[5/8]" />
        </DoorReveal>
        <div className="order-1 md:order-2">
          <p className="chapter">Arquitetos & designers</p>
          <h2 id="profissionais-title" className="t-h2 mt-[1.3125rem] max-w-[14em]">
            Bons projetos se constroem em parceria.
          </h2>
          <p className="t-lead mt-[2.125rem] max-w-[30em] text-ink/80">
            A Casa Áurea está aberta a colaborar com arquitetos, designers de interiores e profissionais
            que buscam mobiliário e curadoria para projetos residenciais e comerciais.
          </p>
          <WhatsAppLink
            message={professionalMessage}
            source="professionals"
            event="professional_contact"
            className="btn btn-solid mt-[2.125rem] w-full sm:w-auto"
          >
            Fale com nossa equipe
          </WhatsAppLink>
          <Pending>políticas para profissionais (atendimento dedicado, reserva técnica, programa de parceiros). Nenhuma é mencionada até a confirmação.</Pending>
        </div>
      </div>
    </section>
  );
}
