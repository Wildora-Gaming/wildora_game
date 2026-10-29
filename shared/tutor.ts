// Casa do Treinador: o que cada criatura pode aprender lá.
// - Repertório: golpes da própria espécie até o nível atual (de graça, inclusive os esquecidos).
// - Golpes do tipo: golpes dos tipos da criatura, com nível mínimo e preço pela força.
//   Ficam de fora os golpes básicos próprios de cada espécie e os golpes dos lendários.
import { MOVES, SPECIES, type MoveId } from "./battle/data";

export interface TutorOption {
  moveId: string;
  /** nível mínimo da criatura */
  level: number;
  /** Sementes (0 = de graça) */
  price: number;
  source: "repertorio" | "tipo";
}

const LEGEND_MOVES = new Set(["juizo_solar", "eclipse", "furia_do_abismo", "punho_colossal"]);
/** Golpe básico próprio de cada espécie (o primeiro do repertório, fraco): não se ensina para outras. */
const BASIC_MOVES = new Set<string>(
  Object.values(SPECIES)
    .map((s) => s.learnset[0]?.[1])
    .filter((id): id is MoveId => !!id && (MOVES[id].power ?? 0) <= 45),
);
BASIC_MOVES.add("investida");

/** Nível mínimo e preço de um golpe do tipo, pela força. */
function tier(power: number | null): { level: number; price: number } {
  if (power === null) return { level: 5, price: 200 };
  if (power <= 45) return { level: 1, price: 100 };
  if (power <= 65) return { level: 10, price: 300 };
  if (power <= 85) return { level: 18, price: 600 };
  return { level: 28, price: 1000 };
}

/** Golpes de Fera que qualquer criatura aprende (além dos do tipo dela). */
const UNIVERSAL = new Set(["mordida_firme", "golpe_bruto"]);

const cache = new Map<string, TutorOption[]>();

/** Tudo que a espécie pode aprender na Casa do Treinador, em ordem de nível. */
export function tutorOptions(speciesId: string): TutorOption[] {
  const hit = cache.get(speciesId);
  if (hit) return hit;
  const sp = SPECIES[speciesId];
  if (!sp) return [];
  const out: TutorOption[] = sp.learnset.map(([level, moveId]) => ({ moveId, level, price: 0, source: "repertorio" as const }));
  const own = new Set(out.map((o) => o.moveId));
  for (const [id, m] of Object.entries(MOVES)) {
    if (own.has(id) || BASIC_MOVES.has(id) || LEGEND_MOVES.has(id)) continue;
    if (!sp.types.includes(m.type) && !UNIVERSAL.has(id)) continue;
    out.push({ moveId: id, ...tier(m.power), source: "tipo" });
  }
  out.sort((a, b) => a.level - b.level || a.price - b.price);
  cache.set(speciesId, out);
  return out;
}

export function tutorOption(speciesId: string, moveId: string): TutorOption | undefined {
  return tutorOptions(speciesId).find((o) => o.moveId === moveId);
}
