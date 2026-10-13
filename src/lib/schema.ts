import { site } from "@/config/site";

/** schema.org FurnitureStore (subtipo de LocalBusiness).
 *  Só inclui dados confirmados: horários, telefone e CEP entram
 *  automaticamente quando forem preenchidos/confirmados em config/site.ts. */
export function localBusinessSchema() {
  const a = site.address;
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "FurnitureStore",
    "@id": `${site.url}/#business`,
    name: site.name,
    description: site.description,
    url: site.url,
    image: `${site.url}/opengraph-image`,
    address: {
      "@type": "PostalAddress",
      streetAddress: a.street,
      addressLocality: a.city,
      addressRegion: a.state,
      addressCountry: a.country,
      ...(a.postalCode ? { postalCode: a.postalCode } : {}),
    },
    founder: site.founders.map((name) => ({ "@type": "Person", name })),
    sameAs: [site.contact.instagram.url],
  };

  if (site.contact.whatsapp) schema.telephone = `+${site.contact.whatsapp}`;
  if (site.contact.email) schema.email = site.contact.email;
  if (site.legal.companyName) schema.legalName = site.legal.companyName;

  if (site.hours.confirmed) {
    schema.openingHoursSpecification = site.hours.rows.flatMap((row) =>
      row.ranges.map(([opens, closes]) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: row.days.map((d) => `https://schema.org/${dayName(d)}`),
        opens,
        closes,
      })),
    );
  }
  return schema;
}

function dayName(d: string) {
  return ({ Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday", Su: "Sunday" } as Record<string, string>)[d];
}
