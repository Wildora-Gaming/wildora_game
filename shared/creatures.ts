// Tabela de criaturas selvagens por zona (ver documento de design).

export interface WildEntry {
  speciesId: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  /** Peso relativo no sorteio (os pesos da Campina somam 100). */
  weight: number;
  /** Só aparece à noite. O ciclo dia/noite ainda não existe: por enquanto fica de fora. */
  nightOnly?: boolean;
}

export const ZONE_CAMPINA_INICIAL: WildEntry[] = [
  { speciesId: "pawly", name: "Pawly", minLevel: 2, maxLevel: 6, weight: 35 },
  { speciesId: "chirpy", name: "Chirpy", minLevel: 2, maxLevel: 6, weight: 30 },
  { speciesId: "rocky", name: "Rocky", minLevel: 2, maxLevel: 6, weight: 20 },
  { speciesId: "zappi", name: "Zappi", minLevel: 2, maxLevel: 6, weight: 13 },
  { speciesId: "shado", name: "Shado", minLevel: 4, maxLevel: 6, weight: 2, nightOnly: true },
];

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
