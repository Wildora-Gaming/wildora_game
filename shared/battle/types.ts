// Tipos e tabela de efetividade (ver "Tipos e efetividade" no documento de design).

export type TypeId =
  | "flora"
  | "brasa"
  | "mare"
  | "pedra"
  | "vento"
  | "faisca"
  | "fera"
  | "espectro"
  | "veneno"
  | "gelo"
  | "luz"
  | "psiquico"
  | "sombrio";

// novos tipos entram no fim: a variação visual dos ginásios usa a posição
export const TYPE_IDS: TypeId[] = ["flora", "brasa", "mare", "pedra", "vento", "faisca", "fera", "espectro", "veneno", "gelo", "luz", "psiquico", "sombrio"];

export const TYPE_LABEL: Record<TypeId, string> = {
  flora: "Flora",
  brasa: "Brasa",
  mare: "Maré",
  pedra: "Pedra",
  vento: "Vento",
  faisca: "Faísca",
  fera: "Fera",
  espectro: "Espectro",
  veneno: "Veneno",
  gelo: "Gelo",
  luz: "Luz",
  psiquico: "Psíquico",
  sombrio: "Sombrio",
};

export const TYPE_COLOR: Record<TypeId, string> = {
  flora: "#5bb04a",
  brasa: "#e8692f",
  mare: "#3a86c8",
  pedra: "#9a8f80",
  vento: "#7fbde3",
  faisca: "#f2c53d",
  fera: "#b08560",
  espectro: "#7b5ea7",
  veneno: "#a24fb0",
  gelo: "#7fd3e0",
  luz: "#e8c94a",
  psiquico: "#e86fa8",
  sombrio: "#4a4458",
};

/** Linha = tipo do golpe, coluna = tipo de quem recebe. Ausente = ×1. */
const CHART: Record<TypeId, Partial<Record<TypeId, number>>> = {
  flora: { flora: 0.5, brasa: 0.5, mare: 2, pedra: 2, vento: 0.5, veneno: 0.5 },
  brasa: { flora: 2, brasa: 0.5, mare: 0.5, pedra: 0.5, espectro: 2, gelo: 2 },
  mare: { flora: 0.5, brasa: 2, mare: 0.5, pedra: 2, gelo: 0.5 },
  pedra: { flora: 0.5, brasa: 2, vento: 2, faisca: 2, gelo: 2 },
  vento: { flora: 2, pedra: 0.5, faisca: 0.5, fera: 2 },
  faisca: { flora: 0.5, mare: 2, pedra: 0.5, vento: 2, faisca: 0.5 },
  fera: { pedra: 0.5, faisca: 2, espectro: 0.5, sombrio: 2 },
  espectro: { brasa: 0.5, fera: 2, espectro: 2, psiquico: 2, sombrio: 0.5 },
  // tipos novos: cada um continua fraco contra exatamente 2 tipos
  veneno: { luz: 2, veneno: 0.5, pedra: 0.5, espectro: 0.5 },
  gelo: { veneno: 2, brasa: 0.5, mare: 0.5, gelo: 0.5 },
  luz: { sombrio: 2, veneno: 0.5, luz: 0.5, brasa: 0.5 },
  psiquico: { veneno: 2, psiquico: 0.5, sombrio: 0.5 },
  sombrio: { psiquico: 2, luz: 2, espectro: 0.5, sombrio: 0.5 },
};

export function typeMultiplier(attack: TypeId, defender: TypeId): number {
  return CHART[attack][defender] ?? 1;
}

/** Multiplicador final contra uma criatura de 1 ou 2 tipos. */
export function effectiveness(attack: TypeId, defenderTypes: readonly TypeId[]): number {
  return defenderTypes.reduce((m, t) => m * typeMultiplier(attack, t), 1);
}
