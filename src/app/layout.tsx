import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bodoni_Moda, Jost, Cormorant_Garamond } from "next/font/google";
import { site } from "@/config/site";
import { localBusinessSchema } from "@/lib/schema";
import { Analytics } from "@/components/layout/Analytics";
import "./globals.css";

// Tipografia aprovada: Bodoni Moda (títulos), Jost (texto e interface), Cormorant Garamond (assinatura).
const display = Bodoni_Moda({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], display: "swap", variable: "--font-display" });
const text = Jost({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-text" });
const wordmark = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-wordmark" });

const title = "Casa Áurea | Mobiliário, decoração e interiores em Tijucas, SC";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: title, template: "%s | Casa Áurea" },
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  keywords: [
    "Casa Áurea Tijucas",
    "móveis Tijucas",
    "decoração Tijucas",
    "mobiliário Tijucas",
    "interiores Tijucas",
    "assessoria de ambientes Tijucas",
  ],
  openGraph: {
    type: "website",
    locale: site.locale,
    url: "/",
    siteName: site.name,
    title,
    description: site.description,
  },
  twitter: { card: "summary_large_image", title, description: site.description },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f4efe8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${text.variable} ${wordmark.variable}`} suppressHydrationWarning>
      <head>
        {/* Ativa as revelações de imagem só quando há JS (sem JS, tudo fica visível). */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema()) }}
        />
      </head>
      <body>
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink focus:px-4 focus:py-3 focus:text-limestone">
          Pular para o conteúdo
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
