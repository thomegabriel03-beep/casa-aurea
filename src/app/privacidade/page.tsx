import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = {
  title: "Política de privacidade",
  alternates: { canonical: "/privacidade" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade">
      <p>
        O formulário de atendimento deste site não armazena dados. As informações que você preenche
        são usadas apenas para montar uma mensagem que é aberta no seu próprio WhatsApp; o envio
        acontece somente se você confirmar.
      </p>
      <Pending>
        texto jurídico completo (LGPD), razão social, CNPJ e canal do encarregado de dados. Revisar
        também se ferramentas de analytics forem ativadas.
      </Pending>
    </LegalPage>
  );
}
