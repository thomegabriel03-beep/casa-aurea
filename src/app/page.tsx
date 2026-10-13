import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { LeadFormProvider } from "@/components/lead/LeadFormProvider";
import { Hero } from "@/components/sections/Hero";
import { Manifesto } from "@/components/sections/Manifesto";
import { AmbientGallery } from "@/components/sections/AmbientGallery";
import { ProductCategories } from "@/components/sections/ProductCategories";
import { ConsultingSection } from "@/components/sections/ConsultingSection";
import { ShowroomSection } from "@/components/sections/ShowroomSection";
import { FounderSection } from "@/components/sections/FounderSection";
import { SocialProof } from "@/components/sections/SocialProof";
import { ProfessionalSection } from "@/components/sections/ProfessionalSection";
import { InstagramSection } from "@/components/sections/InstagramSection";
import { CampaignFeature } from "@/components/catalog/CampaignFeature";

export const revalidate = 300;

/**
 * Home (single page). Cada seção é independente e pode virar página própria
 * em /app/<rota>/page.tsx reaproveitando o mesmo componente.
 */
export default function HomePage() {
  return (
    <LeadFormProvider>
      <Header />
      <main id="conteudo">
        <Hero />
        <Manifesto />
        <CampaignFeature />
        <AmbientGallery />
        <ProductCategories />
        <ConsultingSection />
        <ShowroomSection />
        <FounderSection />
        <SocialProof />
        <ProfessionalSection />
        <InstagramSection />
      </main>
      <Footer />
      <WhatsAppButton />
    </LeadFormProvider>
  );
}
