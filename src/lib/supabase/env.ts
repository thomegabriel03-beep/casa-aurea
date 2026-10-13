/** Leitura central das credenciais. Sem credenciais, o site público continua no ar
 *  (catálogo vazio) e o admin mostra a instrução de configuração. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Buckets do Storage (criados em 0003_storage_and_public.sql). */
export const BUCKETS = ["produtos", "colecoes", "showroom", "institucional", "campanhas"] as const;
export type Bucket = (typeof BUCKETS)[number];
