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
  // golpe básico próprio de cada criatura (o mais fraco do repertório)
  patada: move("patada", "Patada", "fera", 40, 100),
  arranhao: move("arranhao", "Arranhão", "fera", 40, 100),
  rabada: move("rabada", "Rabada", "fera", 40, 100),
  mordiscada: move("mordiscada", "Mordiscada", "fera", 35, 100, { effect: { status: "assustado", chance: 0.1 } }),
  coice: move("coice", "Coice", "fera", 40, 100),
  cabecada: move("cabecada", "Cabeçada", "pedra", 40, 100),
  esbarrao: move("esbarrao", "Esbarrão", "fera", 40, 100),
  rolada_de_la: move("rolada_de_la", "Rolada de Lã", "fera", 40, 100),
  barrigada: move("barrigada", "Barrigada", "fera", 40, 100),
  cabecada_de_chapeu: move("cabecada_de_chapeu", "Cabeçada de Chapéu", "fera", 40, 100),
  bicada: move("bicada", "Bicada", "vento", 35, 100),
  sopro_leve: move("sopro_leve", "Sopro Leve", "vento", 35, 100),
  raiz_rasteira: move("raiz_rasteira", "Raiz Rasteira", "flora", 35, 100),
  // Zebri
  galope: move("galope", "Galope", "fera", 45, 100, { priority: 1 }),
  listras_hipnoticas: move("listras_hipnoticas", "Listras Hipnóticas", "fera", null, 80, {
    effect: { status: "assustado", chance: 1 },
  }),
  pisoteio: move("pisoteio", "Pisoteio", "fera", 75, 90, { effect: { status: "assustado", chance: 0.2 } }),
  // golpes básicos das criaturas novas
  casco_rasteiro: move("casco_rasteiro", "Casco Rasteiro", "pedra", 40, 100),
  orelhada: move("orelhada", "Orelhada", "fera", 40, 100),
  respingo: move("respingo", "Respingo", "mare", 35, 100),
  chifrada: move("chifrada", "Chifrada", "fera", 40, 100),
  garra_quente: move("garra_quente", "Garra Quente", "brasa", 40, 100),
  mordida_gelada: move("mordida_gelada", "Mordida Gelada", "gelo", 40, 100),
  po_brilhante: move("po_brilhante", "Pó Brilhante", "luz", 35, 100),
  esfera_leve: move("esfera_leve", "Esfera Leve", "psiquico", 35, 100),
  arranhao_sombrio: move("arranhao_sombrio", "Arranhão Sombrio", "sombrio", 40, 100),
  pena_cortante: move("pena_cortante", "Pena Cortante", "vento", 40, 100),
  batida_de_casco: move("batida_de_casco", "Batida de Casco", "mare", 40, 100),
  espinho_eletrico: move("espinho_eletrico", "Espinho Elétrico", "faisca", 40, 100),
  brisa_cortante: move("brisa_cortante", "Brisa Cortante", "vento", 40, 100),
  abraco_de_musgo: move("abraco_de_musgo", "Abraço de Musgo", "flora", 40, 100),
  bolhinha: move("bolhinha", "Bolhinha", "mare", 35, 100),
  teia_pegajosa: move("teia_pegajosa", "Teia Pegajosa", "veneno", 35, 100, { effect: { status: "paralisado", chance: 0.1 } }),
  lamacal: move("lamacal", "Lamaçal", "pedra", 40, 100),
  chuva_de_petalas: move("chuva_de_petalas", "Chuva de Pétalas", "flora", 35, 100),
  patinha_quente: move("patinha_quente", "Patinha Quente", "brasa", 40, 100),
  folha_fantasma: move("folha_fantasma", "Folha Fantasma", "sombrio", 35, 100),
  tapa_gelado: move("tapa_gelado", "Tapa Gelado", "gelo", 40, 100),
  cipo: move("cipo", "Cipó", "flora", 40, 100),
  deslize: move("deslize", "Deslize", "mare", 40, 100),
  rolada_blindada: move("rolada_blindada", "Rolada Blindada", "pedra", 40, 100),
  // Veneno
  ferrao_toxico: move("ferrao_toxico", "Ferrão Tóxico", "veneno", 55, 100, { effect: { status: "envenenado", chance: 0.3 } }),
  nuvem_toxica: move("nuvem_toxica", "Nuvem Tóxica", "veneno", null, 80, { effect: { status: "envenenado", chance: 1 } }),
  lodo_acido: move("lodo_acido", "Lodo Ácido", "veneno", 80, 95, { effect: { status: "envenenado", chance: 0.2 } }),
  // Gelo
  estilhaco: move("estilhaco", "Estilhaço de Gelo", "gelo", 60, 100),
  nevasca: move("nevasca", "Nevasca", "gelo", 90, 85, { effect: { status: "assustado", chance: 0.1 } }),
  // Luz
  lampejo: move("lampejo", "Lampejo", "luz", 55, 100, { effect: { status: "assustado", chance: 0.2 } }),
  raio_de_luz: move("raio_de_luz", "Raio de Luz", "luz", 80, 95),
  // Psíquico
  pulso_mental: move("pulso_mental", "Pulso Mental", "psiquico", 55, 100, { effect: { status: "assustado", chance: 0.2 } }),
  onda_psiquica: move("onda_psiquica", "Onda Psíquica", "psiquico", 80, 95),
  hipnose: move("hipnose", "Hipnose", "psiquico", null, 70, { effect: { status: "adormecido", chance: 1 } }),
  // Sombrio
  mordida_sombria: move("mordida_sombria", "Mordida Sombria", "sombrio", 60, 100, { effect: { status: "assustado", chance: 0.2 } }),
  golpe_das_trevas: move("golpe_das_trevas", "Golpe das Trevas", "sombrio", 85, 90),
  // fortes, para os estágios finais
  chama_ardente: move("chama_ardente", "Chama Ardente", "brasa", 90, 85, { effect: { status: "queimado", chance: 0.2 } }),
  maremoto: move("maremoto", "Maremoto", "mare", 90, 85),
  tempestade_de_folhas: move("tempestade_de_folhas", "Tempestade de Folhas", "flora", 90, 85),
  terremoto: move("terremoto", "Terremoto", "pedra", 90, 85),
  furacao: move("furacao", "Furacão", "vento", 90, 80),
  trovao: move("trovao", "Trovão", "faisca", 90, 80, { effect: { status: "paralisado", chance: 0.2 } }),
  // dos lendários
  juizo_solar: move("juizo_solar", "Juízo Solar", "luz", 110, 90),
  eclipse: move("eclipse", "Eclipse", "sombrio", 110, 90, { effect: { status: "assustado", chance: 0.2 } }),
  furia_do_abismo: move("furia_do_abismo", "Fúria do Abismo", "mare", 110, 90),
  punho_colossal: move("punho_colossal", "Punho Colossal", "pedra", 110, 90),
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
  bolhas: move("bolhas", "Bolhas", "mare", 50, 100, { effect: { status: "assustado", chance: 0.2 } }),
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
  [hp, atk, def, spe]: readonly number[],
  baseXp: number,
  catchRate: number,
  learnset: [number, MoveId][],
  evolvesTo?: { species: string; level: number },
): SpeciesDef => ({ id, name, types, base: { hp, atk, def, spe }, baseXp, catchRate, learnset, evolvesTo });

// Linhas das iniciais
const LEAFIN_MOVES: [number, MoveId][] = [[1, "patada"], [1, "chicote_de_rama"], [7, "polen_sonolento"], [12, "mordida_firme"], [18, "folha_navalha"], [34, "golpe_bruto"]];
const FLAMBO_MOVES: [number, MoveId][] = [[1, "arranhao"], [1, "fagulha"], [9, "mordida_firme"], [18, "labareda"], [34, "pedregulho"]];
const AQUARI_MOVES: [number, MoveId][] = [[1, "rabada"], [1, "jato_dagua"], [10, "bolhas"], [18, "onda"], [34, "golpe_bruto"]];
const ZAPPI_MOVES: [number, MoveId][] = [[1, "esbarrao"], [1, "choque_piscante"], [8, "onda_estatica"], [14, "mordida_firme"], [20, "descarga"]];
const ROCKY_MOVES: [number, MoveId][] = [[1, "cabecada"], [3, "rolagem_de_casco"], [12, "mordida_firme"], [20, "pedregulho"]];

/** Níveis do repertório: 6 golpes em 1, 5, 11, 18, 26 e 38 (5 golpes: 1, 6, 14, 24, 36). */
function learn(moves: MoveId[]): [number, MoveId][] {
  const levels = moves.length >= 6 ? [1, 5, 11, 18, 26, 38] : [1, 6, 14, 24, 36];
  return moves.map((m, i): [number, MoveId] => [levels[i], m]);
}

const add = (a: number[], d: number) => a.map((v) => v + d) as [number, number, number, number];

/** Linha de 2 estágios (folha 2): evolui no nível 32. */
function linha2(
  id: string, name: string, types: TypeId[], id2: string, name2: string, types2: TypeId[],
  base: [number, number, number, number], moves: MoveId[],
): Record<string, SpeciesDef> {
  const ls = learn(moves);
  return {
    [id]: species(id, name, types, base, 70, 0.4, ls, { species: id2, level: 32 }),
    [id2]: species(id2, name2, types2, add(base, 28), 220, 0.08, ls),
  };
}

/** Linha de 3 estágios (folha 3): evolui nos níveis 16 e 32. */
function linha3(
  ids: [string, string, string], names: [string, string, string], types: TypeId[], finalTypes: TypeId[],
  base: [number, number, number, number], moves: MoveId[],
): Record<string, SpeciesDef> {
  const ls = learn(moves);
  return {
    [ids[0]]: species(ids[0], names[0], types, base, 62, 0.45, ls, { species: ids[1], level: 16 }),
    [ids[1]]: species(ids[1], names[1], types, add(base, 16), 140, 0.2, ls, { species: ids[2], level: 32 }),
    [ids[2]]: species(ids[2], names[2], finalTypes, add(base, 34), 235, 0.06, ls),
  };
}

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
  pawly: species("pawly", "Pawly", ["fera"], [45, 45, 40, 50], 50, 0.6, [[1, "mordiscada"], [6, "mordida_firme"], [14, "presa_toxica"], [22, "golpe_bruto"]]),
  chirpy: species("chirpy", "Chirpy", ["vento"], [38, 45, 32, 65], 50, 0.6, [[1, "bicada"], [3, "rasante"], [16, "vendaval"]]),
  rocky: species("rocky", "Rocky", ["pedra"], [45, 40, 70, 20], 56, 0.5, ROCKY_MOVES, { species: "rockor", level: 18 }),
  rockor: species("rockor", "Rockor", ["pedra"], [62, 55, 92, 28], 130, 0.2, ROCKY_MOVES, { species: "rockolos", level: 36 }),
  rockolos: species("rockolos", "Rockolos", ["pedra"], [85, 75, 115, 35], 220, 0.05, ROCKY_MOVES),
  zappi: species("zappi", "Zappi", ["faisca"], [35, 50, 30, 60], 56, 0.45, ZAPPI_MOVES, { species: "zapix", level: 18 }),
  zapix: species("zapix", "Zapix", ["faisca"], [50, 68, 42, 80], 130, 0.2, ZAPPI_MOVES, { species: "zaptor", level: 36 }),
  zaptor: species("zaptor", "Zaptor", ["faisca"], [68, 90, 58, 100], 220, 0.05, ZAPPI_MOVES),
  shado: species("shado", "Shado", ["espectro", "brasa"], [40, 55, 40, 55], 90, 0.15, [[1, "lamento"], [4, "fagulha"], [16, "assombro"], [24, "labareda"]]),

  // Bosque
  sprouty: species("sprouty", "Sprouty", ["flora"], [50, 42, 55, 35], 54, 0.55, [[1, "raiz_rasteira"], [3, "chicote_de_rama"], [9, "esporos"], [18, "folha_navalha"]]),
  shroomy: species("shroomy", "Shroomy", ["flora", "pedra"], [55, 48, 62, 25], 62, 0.45, [[1, "cabecada_de_chapeu"], [1, "esporos"], [10, "rolagem_de_casco"], [20, "folha_navalha"]]),
  batto: species("batto", "Batto", ["espectro", "vento"], [42, 50, 38, 66], 70, 0.35, [[1, "rasante"], [5, "lamento"], [15, "assombro"], [22, "vendaval"]]),

  // Campos do leste e do lago
  woolly: species("woolly", "Woolly", ["faisca"], [58, 40, 58, 38], 60, 0.5, [[1, "rolada_de_la"], [4, "onda_estatica"], [8, "choque_piscante"], [20, "descarga"]]),
  zebri: species("zebri", "Zebri", ["fera"], [50, 58, 42, 64], 62, 0.45, [[1, "coice"], [6, "galope"], [12, "listras_hipnoticas"], [18, "pisoteio"]]),
  fluffi: species("fluffi", "Fluffi", ["vento"], [48, 42, 48, 56], 58, 0.5, [[1, "sopro_leve"], [5, "rasante"], [18, "vendaval"]]),
  baleo: species("baleo", "Baleo", ["mare"], [85, 50, 52, 28], 90, 0.3, [[1, "barrigada"], [1, "jato_dagua"], [15, "onda"], [25, "golpe_bruto"]]),

  // ---------------- Regiões novas (folhas 2 e 3) ----------------
  ...linha2("terravin", "Terravin", ["pedra"], "terravor", "Terravor", ["pedra", "flora"], [60, 50, 70, 30], ["casco_rasteiro", "chicote_de_rama", "rolagem_de_casco", "polen_sonolento", "pedregulho", "terremoto"]),
  ...linha2("aurabit", "Aurabit", ["faisca"], "aurabolt", "Aurabolt", ["faisca"], [45, 55, 40, 70], ["orelhada", "choque_piscante", "onda_estatica", "rasante", "descarga", "trovao"]),
  ...linha2("nimblo", "Nimblo", ["mare"], "nimblor", "Nimblor", ["mare"], [58, 52, 52, 50], ["respingo", "jato_dagua", "bolhas", "estilhaco", "onda", "maremoto"]),
  ...linha2("verdely", "Verdely", ["flora"], "verdelar", "Verdelar", ["flora", "luz"], [52, 52, 48, 60], ["chifrada", "chicote_de_rama", "lampejo", "polen_sonolento", "folha_navalha", "tempestade_de_folhas"]),
  ...linha2("pyraxis", "Pyraxis", ["brasa"], "pyraxor", "Pyraxor", ["brasa", "pedra"], [50, 65, 50, 50], ["garra_quente", "fagulha", "mordida_sombria", "rolagem_de_casco", "labareda", "chama_ardente"]),
  ...linha2("zefril", "Zefril", ["gelo"], "zefrion", "Zefrion", ["gelo"], [50, 58, 45, 65], ["mordida_gelada", "rasante", "estilhaco", "mordida_firme", "vendaval", "nevasca"]),
  ...linha2("luminel", "Luminel", ["luz"], "luminella", "Luminella", ["luz", "vento"], [48, 50, 45, 66], ["po_brilhante", "rasante", "lampejo", "polen_sonolento", "raio_de_luz", "vendaval"]),
  ...linha2("bellune", "Bellune", ["psiquico"], "bellunis", "Bellunis", ["psiquico"], [52, 55, 48, 60], ["esfera_leve", "pulso_mental", "hipnose", "lampejo", "onda_psiquica", "raio_de_luz"]),
  ...linha2("drakosh", "Drakosh", ["sombrio"], "drakoshar", "Drakoshar", ["sombrio"], [55, 66, 50, 52], ["arranhao_sombrio", "mordida_sombria", "lamento", "fagulha", "golpe_das_trevas", "golpe_bruto"]),
  ...linha2("venturi", "Venturi", ["vento"], "venturion", "Venturion", ["vento"], [48, 55, 42, 70], ["pena_cortante", "rasante", "lampejo", "vendaval", "furacao"]),
  ...linha2("marinor", "Marinor", ["mare"], "marinox", "Marinox", ["mare", "pedra"], [65, 48, 70, 28], ["batida_de_casco", "jato_dagua", "rolagem_de_casco", "bolhas", "onda", "maremoto"]),
  ...linha2("voltuga", "Voltuga", ["faisca"], "voltugon", "Voltugon", ["faisca"], [50, 60, 55, 45], ["espinho_eletrico", "choque_piscante", "ferrao_toxico", "onda_estatica", "descarga", "trovao"]),

  ...linha3(["zephyl", "zephiro", "zephyrax"], ["Zephyl", "Zephiro", "Zephyrax"], ["vento"], ["vento"], [44, 48, 40, 62], ["brisa_cortante", "rasante", "estilhaco", "vendaval", "furacao"]),
  ...linha3(["mosseroo", "musgaroo", "musgalor"], ["Mosseroo", "Musgaroo", "Musgalor"], ["flora"], ["flora"], [55, 45, 58, 30], ["abraco_de_musgo", "chicote_de_rama", "esporos", "mordida_firme", "folha_navalha", "tempestade_de_folhas"]),
  ...linha3(["bubblit", "bubbelle", "bubbelora"], ["Bubblit", "Bubbelle", "Bubbelora"], ["mare"], ["mare", "psiquico"], [48, 42, 46, 50], ["bolhinha", "bolhas", "hipnose", "pulso_mental", "onda", "onda_psiquica"]),
  ...linha3(["spinora", "spinarra", "spinatrix"], ["Spinora", "Spinarra", "Spinatrix"], ["vento", "veneno"], ["vento", "veneno"], [42, 50, 40, 58], ["teia_pegajosa", "rasante", "ferrao_toxico", "nuvem_toxica", "lodo_acido", "furacao"]),
  ...linha3(["muddle", "lamudo", "lamaroth"], ["Muddle", "Lamudo", "Lamaroth"], ["pedra"], ["pedra"], [55, 50, 55, 30], ["lamacal", "rolagem_de_casco", "mordida_firme", "pedregulho", "terremoto"]),
  ...linha3(["petallia", "petalis", "petaliora"], ["Petallia", "Petalis", "Petaliora"], ["flora"], ["flora", "luz"], [46, 44, 48, 52], ["chuva_de_petalas", "chicote_de_rama", "polen_sonolento", "lampejo", "folha_navalha", "tempestade_de_folhas"]),
  ...linha3(["ignicub", "ignurso", "ignurgo"], ["Ignicub", "Ignurso", "Ignurgo"], ["brasa"], ["brasa", "fera"], [50, 56, 45, 45], ["patinha_quente", "fagulha", "mordida_firme", "labareda", "golpe_bruto", "chama_ardente"]),
  ...linha3(["shadeleaf", "shademoss", "shadegrove"], ["Shadeleaf", "Shademoss", "Shadegrove"], ["sombrio", "flora"], ["sombrio", "flora"], [46, 52, 46, 52], ["folha_fantasma", "chicote_de_rama", "mordida_sombria", "esporos", "folha_navalha", "golpe_das_trevas"]),
  ...linha3(["frostitt", "frostorr", "frostarok"], ["Frostitt", "Frostorr", "Frostarok"], ["gelo"], ["gelo"], [52, 54, 50, 40], ["tapa_gelado", "estilhaco", "mordida_firme", "golpe_bruto", "nevasca"]),
  ...linha3(["tangleo", "tanglora", "tanglodon"], ["Tangleo", "Tanglora", "Tanglodon"], ["flora"], ["flora", "veneno"], [50, 50, 50, 42], ["cipo", "chicote_de_rama", "ferrao_toxico", "esporos", "folha_navalha", "tempestade_de_folhas"]),
  ...linha3(["slitheria", "slitherion", "slitheragon"], ["Slitheria", "Slitherion", "Slitheragon"], ["mare"], ["mare"], [48, 52, 44, 56], ["deslize", "jato_dagua", "bolhas", "mordida_firme", "onda", "maremoto"]),
  ...linha3(["ironclad", "ironback", "ironfort"], ["Ironclad", "Ironback", "Ironfort"], ["pedra"], ["pedra", "fera"], [55, 48, 70, 25], ["rolada_blindada", "rolagem_de_casco", "mordida_firme", "pedregulho", "golpe_bruto", "terremoto"]),

  // ---------------- Lendários (aparecem em eventos no mapa) ----------------
  solvaris: species("solvaris", "Solvaris", ["luz"], [95, 110, 90, 110], 320, 0.03, [[1, "lampejo"], [1, "vendaval"], [1, "raio_de_luz"], [45, "juizo_solar"]]),
  nocteon: species("nocteon", "Nocteon", ["sombrio"], [95, 115, 85, 108], 320, 0.03, [[1, "mordida_sombria"], [1, "hipnose"], [1, "golpe_das_trevas"], [45, "eclipse"]]),
  abyssion: species("abyssion", "Abyssion", ["mare"], [110, 100, 95, 88], 320, 0.03, [[1, "estilhaco"], [1, "onda"], [1, "maremoto"], [45, "furia_do_abismo"]]),
  terralith: species("terralith", "Terralith", ["pedra"], [115, 110, 120, 50], 320, 0.03, [[1, "golpe_bruto"], [1, "pedregulho"], [1, "terremoto"], [45, "punho_colossal"]]),
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
