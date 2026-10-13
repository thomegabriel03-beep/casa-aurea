/** Código Casa Áurea: CA-[TIPO]-[0000]; variantes: CA-[TIPO]-[0000]-V01.
 *  A sequência oficial é gerada no banco (next_public_code, com trava). Aqui: formato, leitura e validação. */

export const TYPE_CODE = /^[A-Z]{3}$/;
export const PUBLIC_CODE = /^CA-([A-Z]{3})-(\d{4,})$/;
export const VARIANT_CODE = /^CA-([A-Z]{3})-(\d{4,})-V(\d{2,})$/;

export function formatPublicCode(typeCode: string, seq: number): string {
  if (!TYPE_CODE.test(typeCode)) throw new Error(`Tipo inválido: ${typeCode}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Sequência inválida: ${seq}`);
  return `CA-${typeCode}-${String(seq).padStart(4, "0")}`;
}

export function formatVariantCode(publicCode: string, seq: number): string {
  if (!PUBLIC_CODE.test(publicCode)) throw new Error(`Código Casa Áurea inválido: ${publicCode}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Sequência de variante inválida: ${seq}`);
  return `${publicCode}-V${String(seq).padStart(2, "0")}`;
}

export const isPublicCode = (s: string) => PUBLIC_CODE.test(s.trim().toUpperCase());

export function parsePublicCode(s: string): { typeCode: string; seq: number } | null {
  const m = s.trim().toUpperCase().match(PUBLIC_CODE);
  return m ? { typeCode: m[1], seq: Number(m[2]) } : null;
}

/** Código principal a partir de um código de variante (o cliente sempre usa o principal). */
export function baseCodeOf(code: string): string | null {
  const c = code.trim().toUpperCase();
  const v = c.match(VARIANT_CODE);
  if (v) return `CA-${v[1]}-${v[2]}`;
  return PUBLIC_CODE.test(c) ? c : null;
}
