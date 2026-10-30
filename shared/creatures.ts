import { biomeAt, inVillage, nearLake } from "./map";
import { evolvedAt } from "./battle/data";
// Criaturas selvagens por zona. Cada campina de grama alta pertence a uma zona.

export interface WildEntry {
  speciesId: string;
  minLevel: number;
  maxLevel: number;
  /** Peso relativo no sorteio */
  weight: number;
  /** Só aparece à noite */
  nightOnly?: boolean;
}

export interface Zone {
  id: string;
  name: string;
  table: WildEntry[];
}

const w = (speciesId: string, minLevel: number, maxLevel: number, weight: number, nightOnly = false): WildEntry => ({
  speciesId,
  minLevel,
  maxLevel,
  weight,
  nightOnly,
});

export const ZONES: Record<string, Zone> = {
  campina: {
    id: "campina",
    name: "Campina Norte",
    table: [w("pawly", 2, 5, 35), w("chirpy", 2, 5, 30), w("rocky", 2, 5, 20), w("zappi", 3, 5, 13), w("shado", 4, 6, 6, true)],
  },
  leste: {
    id: "leste",
    name: "Campos do Leste",
    table: [w("woolly", 4, 7, 30), w("zebri", 4, 7, 25), w("fluffi", 4, 7, 20), w("chirpy", 4, 7, 15), w("baleo", 6, 8, 5), w("zappi", 5, 7, 5)],
  },
  sul: {
    id: "sul",
    name: "Pradaria Sul",
    table: [w("zebri", 5, 8, 25), w("woolly", 5, 8, 20), w("rocky", 5, 8, 20), w("fluffi", 5, 8, 15), w("pawly", 5, 8, 15), w("zappi", 6, 9, 5)],
  },
  bosque: {
    id: "bosque",
    name: "Orla do Bosque",
    table: [w("sprouty", 5, 9, 35), w("shroomy", 5, 9, 25), w("pawly", 5, 8, 20), w("batto", 6, 9, 20, true), w("shado", 7, 10, 6, true)],
  },
  // ---- Expansão do leste ----
  gelada: {
    id: "gelada",
    name: "Planície Gelada",
    table: [w("frostitt", 16, 24, 30), w("zephyl", 16, 24, 25), w("zefril", 17, 25, 20), w("spinora", 16, 24, 15), w("aurabit", 18, 26, 10)],
  },
  encantado: {
    id: "encantado",
    name: "Bosque Encantado",
    table: [
      w("mosseroo", 14, 22, 25), w("petallia", 14, 22, 22), w("tangleo", 15, 23, 18), w("verdely", 16, 24, 14),
      w("luminel", 16, 24, 12), w("bellune", 17, 24, 9), w("shadeleaf", 15, 23, 25, true),
    ],
  },
  vulcao: {
    id: "vulcao",
    name: "Encosta Vulcânica",
    table: [
      w("ignicub", 12, 20, 28), w("muddle", 12, 20, 22), w("ironclad", 13, 21, 18), w("terravin", 13, 21, 15),
      w("pyraxis", 15, 22, 12), w("drakosh", 16, 22, 15, true),
    ],
  },
  recife: {
    id: "recife",
    name: "Costa dos Recifes",
    table: [
      w("bubblit", 12, 20, 28), w("slitheria", 12, 20, 22), w("nimblo", 13, 21, 18), w("marinor", 13, 21, 15),
      w("voltuga", 14, 22, 10), w("venturi", 15, 22, 10),
    ],
  },
};

/** Zona da grama alta numa posição do mapa (o bioma daquele tile). */
export function zoneAt(x: number, y: number): Zone {
  return ZONES[biomeAt(x, y).id] ?? ZONES.campina;
}

// ---------------- Áreas de nível alto ----------------
// Quanto mais longe da Vila Broto, mais fortes as criaturas: a partir de DEEP_START tiles do centro,
// o nível sobe DEEP_RATE por tile (o fundo dos biomas distantes chega perto do nível 80), e elas
// aparecem já evoluídas.
const CENTER = { x: 128, y: 100 };
const DEEP_START = 70;
const DEEP_RATE = 0.75;

export function levelBonus(x: number, y: number): number {
  const d = Math.hypot(x - CENTER.x, (y - CENTER.y) * 1.15);
  return d <= DEEP_START ? 0 : Math.round((d - DEEP_START) * DEEP_RATE);
}

/** Faixa de nível das criaturas selvagens num ponto (para mostrar no HUD). */
export function wildLevels(x: number, y: number): [number, number] {
  const z = zoneAt(x, y);
  const b = levelBonus(x, y);
  const min = Math.min(...z.table.map((e) => e.minLevel));
  const max = Math.max(...z.table.map((e) => e.maxLevel));
  return [Math.min(100, min + b), Math.min(100, max + b)];
}

/** Sorteia o encontro naquele ponto do mapa: zona, bônus de nível pela distância e forma evoluída. */
export function rollWildAt(x: number, y: number, rng: () => number = Math.random, isNight = false) {
  const zone = zoneAt(x, y);
  const { entry, level } = rollWild(zone.table, rng, isNight);
  const lvl = Math.min(100, level + levelBonus(x, y));
  return { zone, entry, level: lvl, speciesId: evolvedAt(entry.speciesId, lvl) };
}

/** Nome da região para mostrar ao jogador. */
export function areaName(x: number, y: number): string {
  if (inVillage(x, y)) return "Vila Broto";
  if (nearLake(x, y)) return "Lago Espelho";
  return biomeAt(x, y).name;
}

export function rollWild(table: WildEntry[], rng: () => number = Math.random, isNight = false) {
  const pool = table.filter((e) => isNight || !e.nightOnly);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r < 0) {
      const level = e.minLevel + Math.floor(rng() * (e.maxLevel - e.minLevel + 1));
      return { entry: e, level };
    }
  }
  const last = pool[pool.length - 1];
  return { entry: last, level: last.minLevel };
}
