import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export default function NotFound() {
  return (
    <main className="wrap flex min-h-[100svh] flex-col justify-center py-[3.4375rem]">
      <Logo />
      <h1 className="t-h2 mt-[3.4375rem] max-w-[14em]">Esta página não existe, mas o showroom sim.</h1>
      <p className="mt-[2.125rem]">
        <Link href="/" className="btn btn-solid">Ir para a página inicial</Link>
      </p>
    </main>
  );
}
