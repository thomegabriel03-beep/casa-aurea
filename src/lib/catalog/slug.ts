/** Slug público: nome + código, ex.: "Sofá Moss" + CA-SOF-0027 → "sofa-moss-ca-sof-0027". */
export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function productSlug(name: string, publicCode?: string | null): string {
  const base = slugify(name);
  return publicCode ? `${base}-${slugify(publicCode)}` : base;
}
