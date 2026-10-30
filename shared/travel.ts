// Viagem rápida entre Centros e Postos de Cura já visitados.
import { MAP_OBJECTS, biomeAt, doorOf, inVillage } from "./map";
import { GYMS } from "./gyms";

export interface TravelPoint {
  id: string;
  name: string;
  /** onde o jogador aparece (em frente à porta) */
  x: number;
  y: number;
}

/** Distância para contar como visitado (chegou perto do Posto). */
export const VISIT_RADIUS = 7;
/** Preço: base + por tile de distância. */
export const travelCost = (a: TravelPoint, b: TravelPoint) => 20 + Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 1.5);

export const TRAVEL_POINTS: TravelPoint[] = MAP_OBJECTS.filter((o) => o.role === "heal").map((o) => {
  const d = doorOf(o);
  const spot = { x: d.x, y: d.y + 1 };
  if (inVillage(d.x, d.y)) return { id: "vila", name: "Vila Broto", ...spot };
  // Posto de Cura ao lado de um ginásio
  const gymObj = MAP_OBJECTS.filter((g) => g.kind === "gym").sort((p, q) => Math.hypot(p.x - o.x, p.y - o.y) - Math.hypot(q.x - o.x, q.y - o.y))[0];
  const gym = GYMS.find((g) => g.id === gymObj?.gymId);
  const region = biomeAt(d.x, d.y).name;
  return { id: gym ? `posto_${gym.id}` : `posto_${d.x}_${d.y}`, name: gym ? `${gym.name} · ${region}` : region, ...spot };
});

export const getTravelPoint = (id: unknown) => TRAVEL_POINTS.find((p) => p.id === id);

/** Ponto de viagem perto de (x, y), se houver. */
export function travelPointNear(x: number, y: number, radius = VISIT_RADIUS) {
  return TRAVEL_POINTS.find((p) => Math.abs(p.x - x) + Math.abs(p.y - y) <= radius);
}
