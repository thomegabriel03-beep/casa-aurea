export const formatPrice = (v: number | null | undefined) =>
  v == null ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatCm = (v: number | null | undefined) =>
  v == null ? "" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} cm`;
