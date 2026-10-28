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
};

/** Zona da grama alta numa posição do mapa. */
export function zoneAt(x: number, y: number): Zone {
  if (x < 40 && y >= 40) return ZONES.bosque;
  if (x >= 50 && y >= 40) return ZONES.sul;
  if (x >= 60) return ZONES.leste;
  return ZONES.campina;
}

/** Nome da região para mostrar ao jogador. */
export function areaName(x: number, y: number): string {
  if (y >= 70) return "Distrito dos Ginásios";
  if (x >= 31 && x <= 63 && y >= 23 && y <= 49) return "Vila Broto";
  if (x >= 58 && y <= 24) return "Lago Espelho";
  return zoneAt(x, y).name;
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
