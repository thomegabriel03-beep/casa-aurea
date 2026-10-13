import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { LeadFormProvider } from "@/components/lead/LeadFormProvider";
import "@/components/catalog/catalog.css";

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <LeadFormProvider>
      <Header />
      <main id="conteudo">{children}</main>
      <Footer />
      <WhatsAppButton />
    </LeadFormProvider>
  );
}
