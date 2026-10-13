import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = {
  title: "Termos de uso",
  alternates: { canonical: "/termos" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso">
      <p>Este site apresenta a Casa Áurea, seu showroom e seus serviços, e não realiza vendas online.</p>
      <Pending>termos de uso redigidos pela assessoria jurídica da empresa.</Pending>
    </LegalPage>
  );
}
