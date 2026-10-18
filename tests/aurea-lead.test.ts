import { test } from "node:test";
import assert from "node:assert/strict";
import { extractContact, suggestedSlugs } from "../src/lib/aurea/lead";

test("lê nome, WhatsApp e e-mail ditos pelo visitante", () => {
  const c = extractContact([
    { role: "user", content: "Quero um sofá claro para sala pequena" },
    { role: "assistant", content: "Ótimo! Meu WhatsApp é da equipe [[wa]]" },
    { role: "user", content: "meu nome é ana paula, meu zap é (48) 99876-5432 e email Ana@Exemplo.com.br" },
  ]);
  assert.equal(c.first, "Quero um sofá claro para sala pequena");
  assert.equal(c.name, "Ana Paula");
  assert.equal(c.phone, "(48) 99876-5432");
  assert.equal(c.email, "ana@exemplo.com.br");
});

test("telefone em vários formatos e nada inventado", () => {
  assert.equal(extractContact([{ role: "user", content: "+55 48 984576227" }]).phone, "(48) 98457-6227");
  assert.equal(extractContact([{ role: "user", content: "4899876 5432" }]).phone, "(48) 99876-5432");
  const none = extractContact([{ role: "user", content: "mesa de 2,40 m para 8 pessoas, sala de 3,5 m" }]);
  assert.equal(none.phone, null);
  assert.equal(none.name, null);
  assert.equal(none.email, null);
});

test("contato só vem das mensagens do visitante", () => {
  const c = extractContact([{ role: "user", content: "oi" }, { role: "assistant", content: "fale com (48) 98457-6227" }]);
  assert.equal(c.phone, null);
});

test("peças indicadas pela Áurea", () => {
  assert.deepEqual(
    suggestedSlugs([
      { role: "assistant", content: "Veja [[sofa-amber-ca-sof-0003]] e [[go:#/acervo]] ou [[wa]]" },
      { role: "user", content: "[[hack]]" },
      { role: "assistant", content: "[[sofa-amber-ca-sof-0003]] [[mesa-napoli-ca-mes-0029]]" },
    ]),
    ["sofa-amber-ca-sof-0003", "mesa-napoli-ca-mes-0029"],
  );
});
