import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanSource, firstName, gate, leadSecret, normalizePhone, signLead, validateContact, verifyLead,
} from "../src/lib/aurea/gate";

const ID = "2338739a-85c1-4605-bf79-fa4b9d50ec6c";
const SECRET = "segredo-de-teste";

test("token: HMAC do id da conversa, só vale com o mesmo segredo e o mesmo id", () => {
  const t = signLead(ID, SECRET);
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(verifyLead(ID, t, SECRET), true);
  assert.equal(verifyLead(ID.toUpperCase(), t, SECRET), true);
  assert.equal(verifyLead(ID, t, "outro-segredo"), false);
  assert.equal(verifyLead("2338739a-85c1-4605-bf79-fa4b9d50ec6d", t, SECRET), false);
  assert.equal(verifyLead(ID, t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), SECRET), false);
  assert.equal(verifyLead(ID, t, null), false);
  assert.equal(verifyLead("nao-e-uuid", t, SECRET), false);
  assert.equal(verifyLead(ID, undefined, SECRET), false);
  assert.equal(verifyLead(ID, "x".repeat(500), SECRET), false);
});

test("segredo: AUREA_LEAD_SECRET, com reserva na chave de serviço", () => {
  assert.equal(leadSecret({ AUREA_LEAD_SECRET: "a", SUPABASE_SERVICE_ROLE_KEY: "b" }), "a");
  assert.equal(leadSecret({ SUPABASE_SERVICE_ROLE_KEY: "b" }), "b");
  assert.equal(leadSecret({}), null);
});

test("limite: 3 mensagens livres, foto exige contato, teto de 60 com token", () => {
  assert.equal(gate({ userMessages: 1, hasImage: false, lead: false }), "ok");
  assert.equal(gate({ userMessages: 3, hasImage: false, lead: false }), "ok");
  assert.equal(gate({ userMessages: 4, hasImage: false, lead: false }), "contato");
  assert.equal(gate({ userMessages: 1, hasImage: true, lead: false }), "contato");
  assert.equal(gate({ userMessages: 4, hasImage: true, lead: true }), "ok");
  assert.equal(gate({ userMessages: 60, hasImage: false, lead: true }), "ok");
  assert.equal(gate({ userMessages: 61, hasImage: false, lead: true }), "teto");
});

test("WhatsApp: Brasil formatado, estrangeiro com DDI, inválidos recusados", () => {
  assert.equal(normalizePhone("48999876543"), "(48) 99987-6543");
  assert.equal(normalizePhone("(48) 99987-6543"), "(48) 99987-6543");
  assert.equal(normalizePhone("+55 48 99987-6543"), "(48) 99987-6543");
  assert.equal(normalizePhone("5548999876543"), "(48) 99987-6543");
  assert.equal(normalizePhone("(48) 3263-1234"), "(48) 3263-1234");
  assert.equal(normalizePhone("+351 912 345 678"), "+351912345678");
  assert.equal(normalizePhone("+1 (415) 555-0100"), "+14155550100");
  assert.equal(normalizePhone("48 8987-65432"), null); // 11 dígitos sem o 9 do celular
  assert.equal(normalizePhone("1234"), null);
  assert.equal(normalizePhone("+12 34"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(12345678901), null);
});

test("cartão de contato: nome e WhatsApp obrigatórios, resto opcional e limpo", () => {
  const ok = validateContact({ name: "  Ana   Paula ", phone: "48999876543", email: "Ana@Exemplo.com.BR", city: "Itapema", profile: "arquiteto" });
  assert.deepEqual(ok, { ok: true, contact: { name: "Ana Paula", phone: "(48) 99987-6543", email: "ana@exemplo.com.br", city: "Itapema", profile: "arquiteto" } });
  assert.deepEqual(validateContact({ name: "A", phone: "48999876543" }), { ok: false, field: "name" });
  assert.deepEqual(validateContact({ name: "Ana", phone: "999" }), { ok: false, field: "phone" });
  assert.deepEqual(validateContact({ name: "Ana", phone: "48999876543", email: "ana@" }), { ok: false, field: "email" });
  const min = validateContact({ name: "Ana<script>", phone: "48999876543", profile: "hacker" });
  assert.equal(min.ok && min.contact.profile, null);
  assert.equal(min.ok && min.contact.email, null);
  assert.equal(min.ok && /[<>]/.test(min.contact.name), false);
});

test("origem da visita: só chaves conhecidas e textos curtos", () => {
  assert.deepEqual(
    cleanSource({ utm_source: "instagram", utm_campaign: "natal", device: "mobile", senha: "x", landing: "/".repeat(400) }),
    { utm_source: "instagram", utm_campaign: "natal", landing: "/".repeat(300), device: "mobile" },
  );
  assert.equal(cleanSource({ device: "geladeira" }), null);
  assert.equal(cleanSource("texto"), null);
  assert.equal(cleanSource([1, 2]), null);
});

test("primeiro nome para a Áurea", () => {
  assert.equal(firstName("Ana Paula"), "Ana");
  assert.equal(firstName("  João-Pedro  Silva"), "João-Pedro");
  assert.equal(firstName("x"), null);
  assert.equal(firstName("<b>Ana</b>"), null); // sinais < > viram espaço: nada de marcação no prompt
  assert.equal(firstName(42), null);
});
