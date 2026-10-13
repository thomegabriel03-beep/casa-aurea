import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { getPublicSlugs, type PublicSlugs } from "@/lib/catalog/public-queries";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const { products, collections } = await getPublicSlugs().catch((): PublicSlugs => ({ products: [], collections: [] }));
  return [
    { url: `${site.url}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${site.url}/colecoes`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${site.url}/moveis`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${site.url}/acervo`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...collections.map((slug) => ({ url: `${site.url}/colecoes/${slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
    ...products.map((p) => ({ url: `${site.url}/produto/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${site.url}/privacidade`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${site.url}/termos`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
