import { ImageResponse } from "next/og";

export const alt = "Casa Áurea: mobiliário, decoração e interiores em Tijucas, SC";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de compartilhamento provisória. Trocar por foto do showroom quando houver. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#3b3029",
          color: "#eeeae3",
          padding: "72px 88px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 34, letterSpacing: 1 }}>Casa Áurea</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, lineHeight: 1.05, maxWidth: 900 }}>
            Sua casa não precisa parecer um catálogo. Precisa parecer com você.
          </div>
          <div style={{ fontSize: 24, marginTop: 34, color: "#cdbfac", fontFamily: "Helvetica, Arial, sans-serif" }}>
            Mobiliário, decoração e interiores · Tijucas, SC
          </div>
        </div>
      </div>
    ),
    size,
  );
}
