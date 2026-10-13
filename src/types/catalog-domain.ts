/** Domínio do catálogo (Missão 1) — espelha supabase/migrations/0002_catalog_architecture.sql */

export type Environment = "indoor" | "outdoor" | "both";
export type CommercialStatus = "active" | "on_request" | "discontinued" | "unknown";
export type Visibility = "internal" | "public" | "hidden" | "archived";
export type CurationTier = "archive" | "curated" | "signature";
export type MediaType = "primary" | "gallery" | "editorial" | "ambient" | "detail" | "video" | "video_poster";
export type ImportStatus = "uploaded" | "processing" | "imported" | "needs_review" | "reviewed" | "approved" | "failed";
export type QualityFlag =
  | "missingOriginalCode" | "missingDimensions" | "missingHighQualityImage" | "missingMaterial"
  | "needsCopyReview" | "needsCommercialReview" | "possibleDuplicate";

export interface Supplier { id: string; name: string; slug: string; notes?: string | null; active: boolean }
export interface Catalog { id: string; supplierId: string; name: string; year?: number | null; fileUrl?: string | null; notes?: string | null; active: boolean }
export interface ProductType { id: string; code: string; name: string; pluralName?: string | null; slug: string; order: number; active: boolean }
export interface ProductSubtype { id: string; typeId: string; name: string; slug: string; order: number; active: boolean }
export interface Material { id: string; name: string; slug: string }
export interface Finish { id: string; name: string; slug: string }

export interface ProductVariant {
  id: string; productId: string; variantCode?: string | null; seq: number; name: string;
  widthCm?: number | null; heightCm?: number | null; depthCm?: number | null; diameterCm?: number | null;
  configuration?: string | null; armType?: string | null; chaiseType?: string | null;
  supplierVariantCode?: string | null; price?: number | null; commercialStatus: CommercialStatus; order: number;
}

export interface ProductMedia {
  type: MediaType; url: string; alt?: string | null; width?: number | null; height?: number | null;
  focalPoint?: string | null; posterUrl?: string | null; order: number; isPrimary: boolean;
}

export interface ProductSourceReference {
  id: string; productId: string; supplierId?: string | null; catalogId?: string | null; year?: number | null;
  page?: string | null; originalCode?: string | null; originalName?: string | null; notes?: string | null;
}

/** Registro administrativo completo (nunca enviar ao público). */
export interface AdminProduct {
  id: string; publicCode?: string | null; name: string; slug: string;
  productTypeId?: string | null; productSubtypeId?: string | null; environment: Environment;
  shortDescription?: string | null; description?: string | null; editorialDescription?: string | null;
  supplierId?: string | null; statusCommercial: CommercialStatus; visibility: Visibility; curationTier: CurationTier;
  designer?: string | null; collectionNameOriginal?: string | null; isConfigurable: boolean; featured: boolean;
  internalNotes?: string | null; seoTitle?: string | null; seoDescription?: string | null; ogImage?: string | null;
  order: number; createdAt?: string; updatedAt?: string;
  type?: ProductType | null; subtype?: ProductSubtype | null;
  variants?: ProductVariant[]; media?: ProductMedia[]; materials?: (Material & { isPrimary?: boolean })[]; finishes?: Finish[];
  sources?: ProductSourceReference[]; collectionIds?: string[];
}

/** O que o site público pode receber. */
export interface PublicProduct {
  publicCode: string | null; name: string; slug: string;
  shortDescription: string | null; description: string | null;
  type: { code: string; name: string; slug: string } | null;
  subtype: { name: string; slug: string } | null;
  environment: Environment; curationTier: CurationTier; isConfigurable: boolean; designer: string | null;
  variants: { code: string | null; name: string; widthCm?: number; heightCm?: number; depthCm?: number; diameterCm?: number; configuration?: string }[];
  media: { type: MediaType; url: string; alt: string; width?: number; height?: number; focalPoint?: string; posterUrl?: string }[];
  materials: string[]; finishes: string[];
  seo: { title: string; description: string | null; image: string | null };
}
