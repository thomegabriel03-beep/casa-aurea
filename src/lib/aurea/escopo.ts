/* Travas de assunto da Áurea: ela só atende sobre a Casa Áurea, casa, decoração e interiores.
   1. Filtro barato no servidor (antes de chamar a IA): pedidos claramente fora do propósito ou tentativas de
      mudar as regras recebem uma recusa elegante pronta, sem gastar IA.
   2. A IA marca com [[fora]] as respostas em que recusou um assunto; o servidor tira a marca e conta.
      Depois de 3 recusas na mesma hora, o mesmo visitante deixa de usar a IA (o site segue com o motor local). */

export type Lang = "pt" | "en" | "es";

const INJECTION: RegExp[] = [
  /\b(ignore|ignora|ignorar|desconsidere|esque[çc]a|forget|disregard|olvida)\b.{0,40}\b(instru[çc][õo]es|instructions|instrucciones|regras|rules|reglas|prompt|anteriores|previous|above)\b/i,
  /\b(system prompt|prompt do sistema|suas instru[çc][õo]es|your instructions|tus instrucciones|jailbreak|modo desenvolvedor|developer mode|dan mode)\b/i,
  /\b(finja|pretend|act[uú]e? como|aja como|act as|roleplay|role-play|you are now|agora voc[êe] [ée]|ahora eres)\b/i,
];

const OFF_TOPIC: RegExp[] = [
  // programação
  /```|\b(python|javascript|typescript|java|c\+\+|php|sql|html|css|regex|c[óo]digo[- ]fonte|source code|algoritmo|algorithm|fun[çc][ãa]o em|script)\b/i,
  // tarefas escolares e textos genéricos
  /\b(reda[çc][ãa]o|essay|ensayo|tcc|monografia|disserta[çc][ãa]o|trabalho escolar|li[çc][ãa]o de casa|homework|tarea escolar|resum[ao] (do|de|el) livro|book summary|poema|poem|letra de m[úu]sica|song lyrics)\b/i,
  // pedidos de tradução de texto arbitrário
  /\b(traduza|traduzir|translate|traduce|traducir)\b.{0,30}\b(texto|text|frase|sentence|documento|document|isso|this|esto)\b/i,
  // outros assuntos sensíveis ou alheios
  /\b(bitcoin|cripto\w*|crypto\w*|a[çc][õo]es da bolsa|stock market|aposta|bet|apostas|cassino|casino|receita m[ée]dica|processo judicial|lawsuit|elei[çc][ãa]o|election|pol[íi]tica partid[áa]ria)\b/i,
];

export function blockedReason(text: string): "regras" | "assunto" | null {
  const t = String(text || "").slice(0, 2000);
  if (INJECTION.some((r) => r.test(t))) return "regras";
  if (OFF_TOPIC.some((r) => r.test(t))) return "assunto";
  return null;
}

const REFUSAL: Record<Lang, string> = {
  pt: "Aqui eu cuido só do que é da Casa Áurea: peças, ambientes, materiais, cortinas, Natal e o nosso showroom. Me conta: qual ambiente você está pensando em transformar?",
  en: "Here I can only help with Casa Áurea: pieces, rooms, materials, curtains, Christmas and our showroom. Tell me, which room are you thinking of transforming?",
  es: "Aquí solo puedo ayudarte con Casa Áurea: piezas, ambientes, materiales, cortinas, Navidad y nuestro showroom. Cuéntame, ¿qué ambiente estás pensando transformar?",
};
export function refusal(lang: unknown): string {
  return REFUSAL[(lang === "en" || lang === "es" ? lang : "pt") as Lang];
}

export const FORA = "[[fora]]";
/** Tira a marca de recusa da resposta da IA e diz se ela estava lá. */
export function stripFora(text: string): { text: string; fora: boolean } {
  const fora = text.includes(FORA);
  return { text: fora ? text.split(FORA).join("").replace(/\s{2,}/g, " ").trim() : text, fora };
}

export const STRIKE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_STRIKES = 3;
