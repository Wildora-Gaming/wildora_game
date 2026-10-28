// Aparência do personagem: opções, paletas e validação.
// Usado pelo servidor (validar) e pelo cliente (criador e desenho).

export const HAIR_STYLES = ["curto", "espetado", "franja", "rabo", "longo", "coque", "cacheado"] as const;
export const EYE_STYLES = ["redondo", "cilios", "sereno", "feliz"] as const;
export const TOP_STYLES = ["camiseta", "jaqueta", "regata", "moletom"] as const;
export const BOTTOM_STYLES = ["calca", "bermuda", "saia"] as const;
export const HAT_STYLES = ["nenhum", "bone", "gorro"] as const;

export const STYLE_LABEL: Record<string, string> = {
  curto: "Curto",
  espetado: "Espetado",
  franja: "Franja",
  rabo: "Rabo de cavalo",
  longo: "Longo",
  coque: "Coque",
  cacheado: "Cacheado",
  redondo: "Redondo",
  cilios: "Com cílios",
  sereno: "Sereno",
  feliz: "Feliz",
  camiseta: "Camiseta",
  jaqueta: "Jaqueta",
  regata: "Regata",
  moletom: "Moletom",
  calca: "Calça",
  bermuda: "Bermuda",
  saia: "Saia",
  nenhum: "Nenhum",
  bone: "Boné",
  gorro: "Gorro",
};

/** [cor, sombra] */
export type Swatch = readonly [string, string];

export const SKIN_COLORS: Swatch[] = [
  ["#ffe3cc", "#ebb999"],
  ["#f6c9a4", "#d99e7c"],
  ["#e0a97c", "#bf8459"],
  ["#c98c62", "#a66e4a"],
  ["#9c6644", "#7a4c30"],
  ["#6e452c", "#52311e"],
];
export const HAIR_COLORS: Swatch[] = [
  ["#2b2b3a", "#1a1a26"],
  ["#5a3a22", "#3e2614"],
  ["#8a4b2a", "#663319"],
  ["#e8c14e", "#c49a30"],
  ["#c2452f", "#922f1f"],
  ["#9aa0b4", "#6f7488"],
  ["#f2efe6", "#c9c4b5"],
  ["#3a6fd0", "#2a52a0"],
  ["#e87ab0", "#c0588c"],
  ["#4caf6a", "#357d4b"],
];
export const EYE_COLORS: Swatch[] = [
  ["#3d2a1e", "#2a1c14"],
  ["#7a4a24", "#5a3418"],
  ["#3a7bd5", "#2a5aa0"],
  ["#3a9a5b", "#2a7444"],
  ["#6f7488", "#50546a"],
  ["#7a5cc4", "#5b4199"],
];
export const CLOTH_COLORS: Swatch[] = [
  ["#d9433f", "#a82f2c"],
  ["#e86b4a", "#bf4f31"],
  ["#e8b84a", "#c4952f"],
  ["#76b041", "#578a2c"],
  ["#3c9a5f", "#2c7547"],
  ["#3a86c8", "#2a66a0"],
  ["#2e3f6e", "#20305a"],
  ["#7a5cc4", "#5b4199"],
  ["#e86b8a", "#c04d6c"],
  ["#f2f0ea", "#cfcabd"],
  ["#9aa0b4", "#6f7488"],
  ["#3a3a46", "#28283a"],
  ["#5a4a3c", "#45382c"],
  ["#c9a46a", "#a5824c"],
];

export interface Look {
  skin: number;
  hair: number;
  hairColor: number;
  eyes: number;
  eyeColor: number;
  top: number;
  topColor: number;
  bottom: number;
  bottomColor: number;
  shoesColor: number;
  hat: number;
  hatColor: number;
}

/** Ordem fixa dos campos na forma compacta "1.0.3...". */
export const LOOK_FIELDS: (keyof Look)[] = [
  "skin",
  "hair",
  "hairColor",
  "eyes",
  "eyeColor",
  "top",
  "topColor",
  "bottom",
  "bottomColor",
  "shoesColor",
  "hat",
  "hatColor",
];

export const LOOK_LIMITS: Record<keyof Look, number> = {
  skin: SKIN_COLORS.length,
  hair: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  eyes: EYE_STYLES.length,
  eyeColor: EYE_COLORS.length,
  top: TOP_STYLES.length,
  topColor: CLOTH_COLORS.length,
  bottom: BOTTOM_STYLES.length,
  bottomColor: CLOTH_COLORS.length,
  shoesColor: CLOTH_COLORS.length,
  hat: HAT_STYLES.length,
  hatColor: CLOTH_COLORS.length,
};

export const DEFAULT_LOOK: Look = {
  skin: 1,
  hair: 1,
  hairColor: 1,
  eyes: 0,
  eyeColor: 0,
  top: 3,
  topColor: 4,
  bottom: 0,
  bottomColor: 12,
  shoesColor: 2,
  hat: 0,
  hatColor: 2,
};

export function encodeLook(look: Look): string {
  return LOOK_FIELDS.map((f) => look[f]).join(".");
}

/** Converte a forma compacta ou um objeto em Look válido; valores fora do intervalo viram o padrão. */
export function parseLook(raw: unknown): Look {
  const look: Look = { ...DEFAULT_LOOK };
  let values: unknown[] = [];
  if (typeof raw === "string") values = raw.split(".").slice(0, LOOK_FIELDS.length);
  else if (raw && typeof raw === "object") values = LOOK_FIELDS.map((f) => (raw as Record<string, unknown>)[f]);
  LOOK_FIELDS.forEach((field, i) => {
    const v = values[i];
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v) ? Number(v) : NaN;
    if (Number.isInteger(n) && n >= 0 && n < LOOK_LIMITS[field]) look[field] = n;
  });
  return look;
}

export function sanitizeLook(raw: unknown): string {
  return encodeLook(parseLook(raw));
}

export function randomLook(rng: () => number = Math.random): Look {
  const look = {} as Look;
  for (const f of LOOK_FIELDS) look[f] = Math.floor(rng() * LOOK_LIMITS[f]);
  return look;
}
