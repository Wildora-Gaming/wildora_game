// Golpes e espécies (ver "Batalha" e "Criaturas" no documento de design).
import type { TypeId } from "./types";

export type StatusId = "queimado" | "paralisado" | "adormecido" | "envenenado" | "assustado";

export const STATUS_LABEL: Record<StatusId, string> = {
  queimado: "QMD",
  paralisado: "PAR",
  adormecido: "DRM",
  envenenado: "VEN",
  assustado: "ASS",
};

export interface MoveDef {
  id: string;
  name: string;
  type: TypeId;
  /** null = golpe de estado, sem dano */
  power: number | null;
  /** 0–100 */
  accuracy: number;
  /** maior age primeiro; padrão 0 */
  priority?: number;
  effect?: { status: StatusId; chance: number };
}

export const MOVES = {
  investida: { id: "investida", name: "Investida", type: "fera", power: 40, accuracy: 100 },
  mordida_firme: { id: "mordida_firme", name: "Mordida Firme", type: "fera", power: 60, accuracy: 95 },
  chicote_de_rama: { id: "chicote_de_rama", name: "Chicote de Rama", type: "flora", power: 45, accuracy: 100 },
  polen_sonolento: {
    id: "polen_sonolento",
    name: "Pólen Sonolento",
    type: "flora",
    power: null,
    accuracy: 75,
    effect: { status: "adormecido", chance: 1 },
  },
  fagulha: {
    id: "fagulha",
    name: "Fagulha",
    type: "brasa",
    power: 40,
    accuracy: 100,
    effect: { status: "queimado", chance: 0.1 },
  },
  jato_dagua: { id: "jato_dagua", name: "Jato d'Água", type: "mare", power: 40, accuracy: 100 },
  rolagem_de_casco: { id: "rolagem_de_casco", name: "Rolagem de Casco", type: "pedra", power: 50, accuracy: 90 },
  rasante: { id: "rasante", name: "Rasante", type: "vento", power: 45, accuracy: 100, priority: 1 },
  choque_piscante: {
    id: "choque_piscante",
    name: "Choque Piscante",
    type: "faisca",
    power: 40,
    accuracy: 100,
    effect: { status: "paralisado", chance: 0.1 },
  },
  lamento: {
    id: "lamento",
    name: "Lamento",
    type: "espectro",
    power: 35,
    accuracy: 100,
    effect: { status: "assustado", chance: 0.3 },
  },
} satisfies Record<string, MoveDef>;

export type MoveId = keyof typeof MOVES;

export function getMove(id: string): MoveDef {
  const move = (MOVES as Record<string, MoveDef>)[id];
  if (!move) throw new Error(`Golpe desconhecido: ${id}`);
  return move;
}

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spe: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  types: TypeId[];
  base: BaseStats;
  /** XP base ao ser derrotada */
  baseXp: number;
  /** Taxa de captura T (0–1) */
  catchRate: number;
  /** [nível, golpe] em ordem de nível */
  learnset: [number, MoveId][];
}

export const SPECIES = {
  leafin: {
    id: "leafin",
    name: "Leafin",
    types: ["flora"],
    base: { hp: 50, atk: 40, def: 60, spe: 30 },
    baseXp: 64,
    catchRate: 0.2,
    learnset: [[1, "investida"], [1, "chicote_de_rama"], [7, "polen_sonolento"], [12, "mordida_firme"]],
  },
  flambo: {
    id: "flambo",
    name: "Flambo",
    types: ["brasa"],
    base: { hp: 40, atk: 60, def: 35, spe: 55 },
    baseXp: 64,
    catchRate: 0.2,
    learnset: [[1, "investida"], [1, "fagulha"], [9, "mordida_firme"]],
  },
  aquari: {
    id: "aquari",
    name: "Aquari",
    types: ["mare"],
    base: { hp: 48, atk: 48, def: 48, spe: 46 },
    baseXp: 64,
    catchRate: 0.2,
    learnset: [[1, "investida"], [1, "jato_dagua"], [10, "mordida_firme"]],
  },
  pawly: {
    id: "pawly",
    name: "Pawly",
    types: ["fera"],
    base: { hp: 45, atk: 45, def: 40, spe: 50 },
    baseXp: 50,
    catchRate: 0.6,
    learnset: [[1, "investida"], [6, "mordida_firme"]],
  },
  chirpy: {
    id: "chirpy",
    name: "Chirpy",
    types: ["vento"],
    base: { hp: 38, atk: 45, def: 32, spe: 65 },
    baseXp: 50,
    catchRate: 0.6,
    learnset: [[1, "investida"], [3, "rasante"]],
  },
  rocky: {
    id: "rocky",
    name: "Rocky",
    types: ["pedra"],
    base: { hp: 45, atk: 40, def: 70, spe: 20 },
    baseXp: 56,
    catchRate: 0.5,
    learnset: [[1, "investida"], [3, "rolagem_de_casco"]],
  },
  zappi: {
    id: "zappi",
    name: "Zappi",
    types: ["faisca"],
    base: { hp: 35, atk: 50, def: 30, spe: 60 },
    baseXp: 56,
    catchRate: 0.45,
    learnset: [[1, "investida"], [1, "choque_piscante"]],
  },
  shado: {
    id: "shado",
    name: "Shado",
    types: ["espectro", "brasa"],
    base: { hp: 40, atk: 55, def: 40, spe: 55 },
    baseXp: 90,
    catchRate: 0.15,
    learnset: [[1, "lamento"], [4, "fagulha"]],
  },
} satisfies Record<string, SpeciesDef>;

export type SpeciesId = keyof typeof SPECIES;

export const STARTERS: SpeciesId[] = ["leafin", "flambo", "aquari"];
export const STARTER_LEVEL = 5;

export function getSpecies(id: string): SpeciesDef {
  const s = (SPECIES as Record<string, SpeciesDef>)[id];
  if (!s) throw new Error(`Espécie desconhecida: ${id}`);
  return s;
}

export function isSpeciesId(id: unknown): id is SpeciesId {
  return typeof id === "string" && id in SPECIES;
}
