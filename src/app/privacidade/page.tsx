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
      <p>
        <strong>Áurea, a concierge do site.</strong> As conversas com a Áurea são registradas para que a
        equipe da Casa Áurea possa dar continuidade ao seu atendimento: o texto da conversa, o idioma, as
        peças indicadas e, se você escrever na conversa, seu nome, WhatsApp ou e-mail. Esses dados são usados
        apenas pela equipe da Casa Áurea para responder ao seu interesse, não são vendidos nem compartilhados
        para publicidade, e ficam guardados em servidor com acesso restrito. As respostas da Áurea são geradas
        por inteligência artificial (Claude, da Anthropic), que recebe o texto da conversa apenas para responder.
      </p>
      <p>
        Você pode pedir a qualquer momento uma cópia ou a exclusão das suas conversas pelo WhatsApp da Casa
        Áurea. Evite escrever na conversa dados sensíveis, como documentos ou informações de saúde.
      </p>
      <Pending>
        texto jurídico completo (LGPD), razão social, CNPJ e canal do encarregado de dados. Revisar
        também se ferramentas de analytics forem ativadas.
      </Pending>
    </LegalPage>
  );
}
