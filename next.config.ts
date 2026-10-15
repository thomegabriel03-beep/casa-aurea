import type { NextConfig } from "next";

/* O site público é a experiência aprovada (public/site/index.html, gerada por
   scripts/build_public_site.py). O painel /admin, as páginas legais e as rotas /api
   continuam no Next.js. */
const PUBLIC_ROUTES: [string, string][] = [
  ["/moveis", "/#/moveis"],
  ["/moveis/:tipo", "/#/moveis/:tipo"],
  ["/outdoor", "/#/outdoor"],
  ["/colecoes", "/#/colecoes"],
  ["/colecoes/:slug", "/#/colecoes/:slug"],
  ["/acervo", "/#/acervo"],
  ["/produto/:slug", "/#/produto/:slug"],
  ["/sobre", "/#/sobre"],
  ["/busca", "/#/busca"],
  ["/curadoria", "/#/curadoria"],
  ["/materiais", "/#/materiais"],
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [375, 430, 768, 1024, 1280, 1440, 1920],
    imageSizes: [64, 128, 256, 384, 512],
  },
  poweredByHeader: false,
  // a página inicial lê o modelo aprovado do disco e embute as peças do banco
  outputFileTracingIncludes: { "/site-html": ["./public/site/index.html"] },
  // importação de planilhas e catálogos pelo painel (padrão do Next é 1 MB)
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/site-html" }], afterFiles: [], fallback: [] };
  },
  async redirects() {
    return PUBLIC_ROUTES.map(([source, destination]) => ({ source, destination, permanent: false }));
  },
  async headers() {
    return [
      { source: "/site/img/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/film/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
