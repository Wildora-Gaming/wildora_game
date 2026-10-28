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

const move = (
  id: string,
  name: string,
  type: TypeId,
  power: number | null,
  accuracy: number,
  extra: Partial<MoveDef> = {},
): MoveDef => ({ id, name, type, power, accuracy, ...extra });

export const MOVES = {
  // Fera
  investida: move("investida", "Investida", "fera", 40, 100),
  mordida_firme: move("mordida_firme", "Mordida Firme", "fera", 60, 95),
  golpe_bruto: move("golpe_bruto", "Golpe Bruto", "fera", 80, 85),
  presa_toxica: move("presa_toxica", "Presa Tóxica", "fera", 50, 95, { effect: { status: "envenenado", chance: 0.3 } }),
  // Flora
  chicote_de_rama: move("chicote_de_rama", "Chicote de Rama", "flora", 45, 100),
  polen_sonolento: move("polen_sonolento", "Pólen Sonolento", "flora", null, 75, {
    effect: { status: "adormecido", chance: 1 },
  }),
  folha_navalha: move("folha_navalha", "Folha Navalha", "flora", 70, 95),
  esporos: move("esporos", "Esporos", "flora", null, 85, { effect: { status: "envenenado", chance: 1 } }),
  // Brasa
  fagulha: move("fagulha", "Fagulha", "brasa", 40, 100, { effect: { status: "queimado", chance: 0.1 } }),
  labareda: move("labareda", "Labareda", "brasa", 70, 95, { effect: { status: "queimado", chance: 0.15 } }),
  // Maré
  jato_dagua: move("jato_dagua", "Jato d'Água", "mare", 40, 100),
  onda: move("onda", "Onda", "mare", 70, 100),
  // Pedra
  rolagem_de_casco: move("rolagem_de_casco", "Rolagem de Casco", "pedra", 50, 90),
  pedregulho: move("pedregulho", "Pedregulho", "pedra", 75, 90),
  // Vento
  rasante: move("rasante", "Rasante", "vento", 45, 100, { priority: 1 }),
  vendaval: move("vendaval", "Vendaval", "vento", 70, 95),
  // Faísca
  choque_piscante: move("choque_piscante", "Choque Piscante", "faisca", 40, 100, {
    effect: { status: "paralisado", chance: 0.1 },
  }),
  descarga: move("descarga", "Descarga", "faisca", 70, 95, { effect: { status: "paralisado", chance: 0.15 } }),
  onda_estatica: move("onda_estatica", "Onda Estática", "faisca", null, 85, {
    effect: { status: "paralisado", chance: 1 },
  }),
  // Espectro
  lamento: move("lamento", "Lamento", "espectro", 35, 100, { effect: { status: "assustado", chance: 0.3 } }),
  assombro: move("assombro", "Assombro", "espectro", 65, 100, { effect: { status: "assustado", chance: 0.2 } }),
} satisfies Record<string, MoveDef>;

export type MoveId = keyof typeof MOVES;

export function getMove(id: string): MoveDef {
  const m = (MOVES as Record<string, MoveDef>)[id];
  if (!m) throw new Error(`Golpe desconhecido: ${id}`);
  return m;
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
  evolvesTo?: { species: string; level: number };
}

const species = (
  id: string,
  name: string,
  types: TypeId[],
  [hp, atk, def, spe]: [number, number, number, number],
  baseXp: number,
  catchRate: number,
  learnset: [number, MoveId][],
  evolvesTo?: { species: string; level: number },
): SpeciesDef => ({ id, name, types, base: { hp, atk, def, spe }, baseXp, catchRate, learnset, evolvesTo });

// Linhas das iniciais
const LEAFIN_MOVES: [number, MoveId][] = [[1, "investida"], [1, "chicote_de_rama"], [7, "polen_sonolento"], [12, "mordida_firme"], [18, "folha_navalha"], [34, "golpe_bruto"]];
const FLAMBO_MOVES: [number, MoveId][] = [[1, "investida"], [1, "fagulha"], [9, "mordida_firme"], [18, "labareda"], [34, "pedregulho"]];
const AQUARI_MOVES: [number, MoveId][] = [[1, "investida"], [1, "jato_dagua"], [10, "mordida_firme"], [18, "onda"], [34, "golpe_bruto"]];
const ZAPPI_MOVES: [number, MoveId][] = [[1, "investida"], [1, "choque_piscante"], [8, "onda_estatica"], [14, "mordida_firme"], [20, "descarga"]];
const ROCKY_MOVES: [number, MoveId][] = [[1, "investida"], [3, "rolagem_de_casco"], [12, "mordida_firme"], [20, "pedregulho"]];

export const SPECIES: Record<string, SpeciesDef> = {
  leafin: species("leafin", "Leafin", ["flora"], [50, 40, 60, 30], 64, 0.2, LEAFIN_MOVES, { species: "leafox", level: 16 }),
  leafox: species("leafox", "Leafox", ["flora"], [65, 55, 75, 45], 142, 0.1, LEAFIN_MOVES, { species: "leafaurus", level: 32 }),
  leafaurus: species("leafaurus", "Leafaurus", ["flora", "fera"], [85, 75, 95, 60], 236, 0.05, LEAFIN_MOVES),

  flambo: species("flambo", "Flambo", ["brasa"], [40, 60, 35, 55], 64, 0.2, FLAMBO_MOVES, { species: "flamber", level: 16 }),
  flamber: species("flamber", "Flamber", ["brasa"], [55, 78, 48, 72], 142, 0.1, FLAMBO_MOVES, { species: "flamberus", level: 32 }),
  flamberus: species("flamberus", "Flamberus", ["brasa", "pedra"], [75, 100, 65, 88], 236, 0.05, FLAMBO_MOVES),

  aquari: species("aquari", "Aquari", ["mare"], [48, 48, 48, 46], 64, 0.2, AQUARI_MOVES, { species: "aquarel", level: 16 }),
  aquarel: species("aquarel", "Aquarel", ["mare"], [64, 64, 64, 62], 142, 0.1, AQUARI_MOVES, { species: "aquarion", level: 32 }),
  aquarion: species("aquarion", "Aquarion", ["mare"], [88, 82, 82, 78], 236, 0.05, AQUARI_MOVES),

  // Campina
  pawly: species("pawly", "Pawly", ["fera"], [45, 45, 40, 50], 50, 0.6, [[1, "investida"], [6, "mordida_firme"], [14, "presa_toxica"], [22, "golpe_bruto"]]),
  chirpy: species("chirpy", "Chirpy", ["vento"], [38, 45, 32, 65], 50, 0.6, [[1, "investida"], [3, "rasante"], [16, "vendaval"]]),
  rocky: species("rocky", "Rocky", ["pedra"], [45, 40, 70, 20], 56, 0.5, ROCKY_MOVES, { species: "rockor", level: 18 }),
  rockor: species("rockor", "Rockor", ["pedra"], [62, 55, 92, 28], 130, 0.2, ROCKY_MOVES, { species: "rockolos", level: 36 }),
  rockolos: species("rockolos", "Rockolos", ["pedra"], [85, 75, 115, 35], 220, 0.05, ROCKY_MOVES),
  zappi: species("zappi", "Zappi", ["faisca"], [35, 50, 30, 60], 56, 0.45, ZAPPI_MOVES, { species: "zapix", level: 18 }),
  zapix: species("zapix", "Zapix", ["faisca"], [50, 68, 42, 80], 130, 0.2, ZAPPI_MOVES, { species: "zaptor", level: 36 }),
  zaptor: species("zaptor", "Zaptor", ["faisca"], [68, 90, 58, 100], 220, 0.05, ZAPPI_MOVES),
  shado: species("shado", "Shado", ["espectro", "brasa"], [40, 55, 40, 55], 90, 0.15, [[1, "lamento"], [4, "fagulha"], [16, "assombro"], [24, "labareda"]]),

  // Bosque
  sprouty: species("sprouty", "Sprouty", ["flora"], [50, 42, 55, 35], 54, 0.55, [[1, "investida"], [3, "chicote_de_rama"], [9, "esporos"], [18, "folha_navalha"]]),
  shroomy: species("shroomy", "Shroomy", ["flora", "pedra"], [55, 48, 62, 25], 62, 0.45, [[1, "investida"], [1, "esporos"], [10, "rolagem_de_casco"], [20, "folha_navalha"]]),
  batto: species("batto", "Batto", ["espectro", "vento"], [42, 50, 38, 66], 70, 0.35, [[1, "rasante"], [5, "lamento"], [15, "assombro"], [22, "vendaval"]]),

  // Campos do leste e do lago
  woolly: species("woolly", "Woolly", ["faisca"], [58, 40, 58, 38], 60, 0.5, [[1, "investida"], [4, "onda_estatica"], [8, "choque_piscante"], [20, "descarga"]]),
  zebri: species("zebri", "Zebri", ["fera"], [50, 58, 42, 64], 62, 0.45, [[1, "investida"], [6, "mordida_firme"], [16, "golpe_bruto"]]),
  fluffi: species("fluffi", "Fluffi", ["vento"], [48, 42, 48, 56], 58, 0.5, [[1, "investida"], [5, "rasante"], [18, "vendaval"]]),
  baleo: species("baleo", "Baleo", ["mare"], [85, 50, 52, 28], 90, 0.3, [[1, "investida"], [1, "jato_dagua"], [15, "onda"], [25, "golpe_bruto"]]),
};

export type SpeciesId = string;

export const STARTERS: SpeciesId[] = ["leafin", "flambo", "aquari"];
export const STARTER_LEVEL = 5;

export function getSpecies(id: string): SpeciesDef {
  const s = SPECIES[id];
  if (!s) throw new Error(`Espécie desconhecida: ${id}`);
  return s;
}

export function isSpeciesId(id: unknown): id is SpeciesId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(SPECIES, id);
}
