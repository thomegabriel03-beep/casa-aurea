import { baseCodeOf } from "./codes";

/** Lê a busca do admin: identifica códigos Casa Áurea (inclusive de variante) e separa termos.
 *  A busca em si roda no banco (admin_search_products), que exige todos os termos. */
export function parseAdminQuery(q: string): { code: string | null; terms: string[] } {
  const raw = q.trim();
  const tokens = raw.split(/\s+/).filter(Boolean);
  const codeToken = tokens.find((t) => baseCodeOf(t));
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return { code: codeToken ? baseCodeOf(codeToken) : null, terms: tokens.map(norm) };
}
