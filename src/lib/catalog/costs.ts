/** Planilha de custos (interna): "código; custo". Leitura pura, sem banco — testada em tests/costs.test.ts.
 *  Aceita ; , ou tab como separador, cabeçalho opcional e valores no formato brasileiro (R$ 1.234,56). */

export type CostLine = { line: number; code: string; cost: number };
export type CostParse = { rows: CostLine[]; errors: string[] };

const CODE_HEAD = /^(cod|codigo|code|ref|referencia|sku|produto)$/;
const COST_HEAD = /custo|cost|^(valor|preco)$/;

/** "R$ 1.234,56" → 1234.56 · "1234.5" → 1234.5 · "2.500" → 2500. Devolve null se não for número. */
export function parseMoney(raw: string): number | null {
  let s = String(raw ?? "").replace(/R\$|\s|\u00a0/gi, "").trim();
  if (!s) return null;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function detectSep(first: string): string {
  const count = (c: string) => splitLine(first, c).length - 1;
  const cands: [string, number][] = [[";", count(";")], ["\t", count("\t")], [",", count(",")]];
  cands.sort((a, b) => b[1] - a[1]);
  return cands[0][1] > 0 ? cands[0][0] : ";";
}

const headKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function parseCostCsv(text: string): CostParse {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: CostLine[] = [];
  const errors: string[] = [];
  const firstIdx = lines.findIndex((l) => l.trim() !== "");
  if (firstIdx < 0) return { rows, errors: ["A planilha está vazia."] };
  const sep = detectSep(lines[firstIdx]);
  let codeCol = 0, costCol = 1, start = firstIdx;
  const head = splitLine(lines[firstIdx], sep).map(headKey);
  const ci = head.findIndex((h) => CODE_HEAD.test(h));
  const pi = head.findIndex((h) => COST_HEAD.test(h));
  if (ci >= 0 || pi >= 0) {
    if (ci >= 0) codeCol = ci;
    if (pi >= 0) costCol = pi;
    else if (codeCol === 1) costCol = 0;
    start = firstIdx + 1;
  } else if (parseMoney(splitLine(lines[firstIdx], sep)[1] ?? "") === null) {
    start = firstIdx + 1; // cabeçalho com nomes desconhecidos: usa as duas primeiras colunas
  }
  const seen = new Map<string, number>();
  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], sep);
    const code = (cells[codeCol] ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    const cost = parseMoney(cells[costCol] ?? "");
    if (!code) { errors.push(`Linha ${i + 1}: sem código.`); continue; }
    if (cost === null || cost < 0) { errors.push(`Linha ${i + 1} (${code}): custo inválido “${cells[costCol] ?? ""}”.`); continue; }
    const prev = seen.get(code);
    if (prev !== undefined) { rows[prev] = { line: i + 1, code, cost }; continue; } // vale a última linha
    seen.set(code, rows.length);
    rows.push({ line: i + 1, code, cost });
  }
  return { rows, errors };
}
