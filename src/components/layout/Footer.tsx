"use client";

import Link from "next/link";
import { site, mapsDirectionsUrl } from "@/config/site";
import { genericMessage } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { WhatsAppLink } from "@/components/ui/WhatsAppLink";
import { Pending } from "@/components/ui/Pending";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer id="contato" className="bg-walnut text-limestone">
      <div className="wrap pb-10 pt-[5.5rem] lg:pt-[9rem]">
        <div className="grid gap-14 lg:grid-cols-[5fr_8fr]">
          <div>
            <p className="font-serif text-[clamp(2.625rem,6vw,5.5625rem)] font-light leading-none tracking-[-0.02em]">Casa Áurea</p>
            <p className="mt-5 text-sand">
              Mobiliário.<br />Decoração.<br />Interiores.
            </p>
          </div>

          <div className="grid gap-10 text-[0.9375rem] sm:grid-cols-3">
            <div>
              <h2 className="t-caption text-sand">Showroom</h2>
              <address className="mt-3 not-italic leading-relaxed">
                {site.address.street}
                <br />
                {site.address.district}, {site.address.city} — {site.address.state}
              </address>
              <a
                href={mapsDirectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("showroom_directions", { source: "footer" })}
                className="link-line mt-3"
              >
                Como chegar
              </a>
            </div>
            <div>
              <h2 className="t-caption text-sand">Conversa</h2>
              <ul className="mt-3 space-y-2">
                <li>
                  <WhatsAppLink message={genericMessage} source="footer" className="link-line text-left">
                    WhatsApp
                  </WhatsAppLink>
                </li>
                <li>
                  <a
                    href={site.contact.instagram.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => track("instagram_click", { source: "footer" })}
                    className="link-line"
                  >
                    Instagram
                  </a>
                </li>
                {site.contact.email && (
                  <li>
                    <a href={`mailto:${site.contact.email}`} className="link-line">
                      {site.contact.email}
                    </a>
                  </li>
                )}
              </ul>
            </div>
            <div>
              <h2 className="t-caption text-sand">Informações</h2>
              <ul className="mt-3 space-y-2">
                <li><Link href="/privacidade" className="link-line">Política de privacidade</Link></li>
                <li><Link href="/termos" className="link-line">Termos de uso</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-[5.5rem] flex flex-col gap-3 border-t border-limestone/15 pt-6 text-[0.8125rem] text-sand sm:flex-row sm:justify-between">
          <p>
            © {year} Casa Áurea
            {site.legal.companyName && <> · {site.legal.companyName}</>}
            {site.legal.cnpj && <> · CNPJ {site.legal.cnpj}</>}
          </p>
          <p>Tijucas — Santa Catarina</p>
          <p className="text-[0.6875rem] uppercase tracking-[0.24em] text-sand/70">Experiência digital <span className="text-limestone/85">VETRA</span></p>
        </div>
        {!site.legal.cnpj && <Pending tone="dark">razão social e CNPJ confirmados pela empresa.</Pending>}
      </div>
    </footer>
  );
}
