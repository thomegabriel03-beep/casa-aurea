import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [375, 430, 768, 1024, 1280, 1440, 1920],
    imageSizes: [64, 128, 256, 384, 512],
  },
  poweredByHeader: false,
  // importação de planilhas e catálogos pelo painel (padrão do Next é 1 MB)
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
