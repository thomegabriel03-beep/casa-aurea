"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { environmentOptions, momentOptions } from "@/data/lead";
import { buildLeadMessage, formatBrPhone, whatsappUrl } from "@/lib/whatsapp";
import { track } from "@/lib/analytics";
import { SHOW_PENDING } from "@/config/site";
import { cn } from "@/lib/cn";

type Step = 1 | 2 | "done";

export function LeadDialog({ source, onClose }: { source: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState<Step>(1);
  const [environment, setEnvironment] = useState("");
  const [moment, setMoment] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ text: string; url: string | null } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    d.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  const close = () => {
    ref.current?.close();
    onClose();
  };

  const next = () => {
    if (!environment || !moment) {
      setError("Escolha o tipo de ambiente e o momento do seu projeto para continuar.");
      return;
    }
    setError("");
    setStep(2);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (!name.trim() || !city.trim() || digits.length < 10) {
      setError(
        digits.length < 10 && phone
          ? "Informe o WhatsApp com DDD, por exemplo (48) 99999-9999."
          : "Preencha nome, WhatsApp e cidade para falarmos com você.",
      );
      return;
    }
    setError("");
    const momentPhrase = momentOptions.find((m) => m.label === moment)?.phrase ?? moment.toLowerCase();
    const text = buildLeadMessage({ name, phone, city, environment, momentPhrase, message });
    const url = whatsappUrl(text);
    track("lead_completed", { source, environment, moment });
    if (url) {
      track("click_whatsapp", { source: `lead_form:${source}` });
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setResult({ text, url });
    setStep("done");
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className={cn(
        "m-0 h-dvh max-h-dvh w-full max-w-full bg-limestone p-0 text-ink",
        "sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-[40rem]",
        "open:animate-[rise_0.6s_var(--ease-quiet)_both]",
      )}
    >
      <div className="flex h-full flex-col overflow-y-auto px-[1.3125rem] pb-8 pt-5 sm:px-[3.4375rem] sm:pb-[3.4375rem] sm:pt-8">
        <div className="flex items-center justify-between">
          <p className="t-caption">{step === "done" ? "Mensagem pronta" : `Etapa ${step} de 2`}</p>
          <button type="button" onClick={close} className="-mr-3 p-3 text-sm text-ink" aria-label="Fechar formulário">
            Fechar
          </button>
        </div>

        {step !== "done" && (
          <>
            <h2 id={titleId} className="t-h3 mt-8 max-w-[18em] sm:mt-10">
              {step === 1 ? "Conte sobre o espaço que você quer compor." : "Para onde enviamos a conversa?"}
            </h2>

            <form onSubmit={submit} className="mt-8 flex flex-1 flex-col" noValidate>
              {step === 1 ? (
                <div className="space-y-9">
                  <ChoiceGroup legend="Tipo de ambiente" options={environmentOptions.map((o) => o)} value={environment} onChange={setEnvironment} />
                  <ChoiceGroup legend="Em que momento você está?" options={momentOptions.map((o) => o.label)} value={moment} onChange={setMoment} />
                </div>
              ) : (
                <div className="space-y-6">
                  <Field label="Nome" id="lead-name" value={name} onChange={setName} autoComplete="name" required />
                  <Field
                    label="WhatsApp"
                    id="lead-phone"
                    value={phone}
                    onChange={(v) => setPhone(formatBrPhone(v))}
                    autoComplete="tel-national"
                    inputMode="tel"
                    placeholder="(48) 99999-9999"
                    required
                  />
                  <Field label="Cidade" id="lead-city" value={city} onChange={setCity} autoComplete="address-level2" required />
                  <div>
                    <label htmlFor="lead-msg" className="t-caption block text-ink">
                      Conte um pouco sobre o que você procura <span className="text-taupe">(opcional)</span>
                    </label>
                    <textarea
                      id="lead-msg"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="mt-2 w-full resize-none border-b border-sand bg-transparent py-2 text-[1.0625rem] outline-none transition-colors focus:border-ink"
                    />
                  </div>
                  <p className="t-caption">
                    Usamos seus dados apenas para responder a este contato. Nada é armazenado neste site:
                    a conversa continua no WhatsApp.
                  </p>
                </div>
              )}

              <p role="alert" aria-live="polite" className="mt-6 min-h-[1.5rem] text-sm text-[#8a3b2a]">
                {error}
              </p>

              <div className="mt-auto flex items-center gap-6 pt-6">
                {step === 1 ? (
                  <button type="button" onClick={next} className="btn btn-solid w-full sm:w-auto">
                    Continuar
                  </button>
                ) : (
                  <>
                    <button type="submit" className="btn btn-solid flex-1 sm:flex-none">
                      Falar com a Casa Áurea
                    </button>
                    <button type="button" onClick={() => setStep(1)} className="link-line text-sm">
                      Voltar
                    </button>
                  </>
                )}
              </div>
            </form>
          </>
        )}

        {step === "done" && result && (
          <div className="mt-10 flex flex-1 flex-col">
            <h2 id={titleId} className="t-h3 max-w-[18em]">
              {result.url ? "Abrimos o WhatsApp com a sua mensagem." : "Sua mensagem está pronta."}
            </h2>
            {result.url ? (
              <p className="t-body mt-4 text-taupe">
                Se a janela não abriu,{" "}
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="link-line text-ink">
                  toque aqui para continuar no WhatsApp
                </a>
                .
              </p>
            ) : (
              SHOW_PENDING && (
                <p className="mt-4 border-l border-bronze/60 pl-3 text-sm text-taupe">
                  O número oficial do WhatsApp ainda não foi configurado (NEXT_PUBLIC_WHATSAPP_NUMBER).
                  Quando estiver, esta mensagem será enviada automaticamente:
                </p>
              )
            )}
            <pre className="mt-6 whitespace-pre-wrap bg-linen p-5 font-sans text-sm leading-relaxed text-ink">{result.text}</pre>
            <div className="mt-auto pt-8">
              <button type="button" onClick={close} className="btn btn-ghost w-full sm:w-auto">
                Voltar ao site
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="t-caption mb-3 text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = value === opt;
          return (
            <label
              key={opt}
              className={cn(
                "cursor-pointer select-none border px-4 py-2.5 text-[0.9375rem] transition-colors duration-300",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bronze",
                checked ? "border-ink bg-ink text-limestone" : "border-sand hover:border-taupe",
              )}
            >
              <input type="radio" name={name} value={opt} checked={checked} onChange={() => onChange(opt)} className="sr-only" />
              {opt}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  ...rest
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  return (
    <div>
      <label htmlFor={id} className="t-caption block text-ink">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border-b border-sand bg-transparent py-2.5 text-[1.0625rem] outline-none transition-colors placeholder:text-sand focus:border-ink"
        {...rest}
      />
    </div>
  );
}
