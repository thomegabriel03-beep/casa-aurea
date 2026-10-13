"use client";

import { site } from "@/config/site";
import { instagramPosts } from "@/data/instagram";
import { track } from "@/lib/analytics";
import { Media } from "@/components/ui/Media";

export function InstagramSection() {
  return (
    <section aria-labelledby="instagram-title" className="section pt-0">
      <div className="wrap">
        <div className="flex flex-col justify-between gap-4 border-t border-sand pt-[3.4375rem] sm:flex-row sm:items-end">
          <h2 id="instagram-title" className="t-h2">
            Inspirações Casa Áurea
          </h2>
          <a
            href={site.contact.instagram.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("instagram_click", { source: "instagram_section" })}
            className="link-line self-start text-[0.9375rem] sm:self-auto"
          >
            Acompanhe {site.contact.instagram.handle}
          </a>
        </div>

        <ul className="mt-[2.125rem] grid grid-cols-2 gap-[0.5rem] sm:grid-cols-3 lg:grid-cols-6 lg:gap-[0.8125rem]">
          {instagramPosts.map((post) => (
            <li key={post.id}>
              <a
                href={post.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("instagram_click", { source: "instagram_grid", post: post.id })}
                className="group block overflow-hidden"
                aria-label="Ver publicação no Instagram da Casa Áurea"
              >
                <Media
                  item={post.media}
                  sizes="(min-width:1024px) 16vw, (min-width:640px) 33vw, 50vw"
                  className="aspect-[4/5] w-full"
                  imgClassName="transition-transform duration-[1.2s] ease-[var(--ease-quiet)] group-hover:scale-[1.03]"
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
