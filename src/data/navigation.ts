export type NavItem = { label: string; href: string };

/** Enquanto o site é single page, os itens apontam para âncoras.
 *  Para virar páginas, basta trocar o href por "/ambientes", etc. */
export const navigation: NavItem[] = [
  { label: "Coleções", href: "/colecoes" },
  { label: "Móveis", href: "/moveis" },
  { label: "Ambientes", href: "/#ambientes" },
  { label: "Assessoria", href: "/#assessoria" },
  { label: "Showroom", href: "/#showroom" },
  { label: "Contato", href: "/#contato" },
];
