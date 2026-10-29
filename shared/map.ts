import { GYMS } from "./gyms";
import { TYPE_IDS } from "./battle/types";
// Mapa "Campina Inicial" com a Vila Broto no centro.
// Gerado por código de forma determinística: cliente e servidor chegam ao mesmo mundo.
// Duas camadas: o chão (um tipo por tile) e objetos (árvores, casas, pedras...) que bloqueiam
// a área da base e podem ser desenhados mais altos que ela.

export enum Tile {
  Grass = 0,
  Path = 1,
  TallGrass = 2,
  Water = 3,
  Sand = 4,
  Flowers = 5,
}

export type ObjectKind = "tree" | "pine" | "house" | "rock" | "fence" | "lamp" | "sign" | "bush" | "well" | "gym" | "npc";

export interface MapObject {
  kind: ObjectKind;
  /** canto superior esquerdo da área que bloqueia (em tiles) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** variação visual (cor do telhado etc.) */
  variant: number;
  /** função especial: Centro de Cura, Loja */
  role?: "heal" | "shop" | "gym" | "tutor";
  /** ginásio deste prédio ou deste líder */
  gymId?: string;
  /** NPC: aparência e nome */
  look?: string;
  name?: string;
  /** texto das placas */
  text?: string;
}

/** Colunas e fileiras dos ginásios no Distrito (canto superior esquerdo do prédio). */
const GYM_COLS = [14, 26, 60, 72];
const GYM_ROWS = [73, 81];

export const MAP_WIDTH = 96;
export const MAP_HEIGHT = 96;

export const SPAWN = { x: 47, y: 37 };
/** Em frente à porta do Centro de Cura: onde o jogador volta após perder. */
export const HEAL_POINT = { x: 43, y: 29 };

/** Tamanho da área bloqueada de cada objeto. */
const FOOTPRINT: Record<ObjectKind, [number, number]> = {
  tree: [2, 1],
  pine: [1, 1],
  house: [5, 3],
  rock: [1, 1],
  fence: [1, 1],
  lamp: [1, 1],
  sign: [1, 1],
  bush: [1, 1],
  well: [2, 1],
  gym: [7, 4],
  npc: [1, 1],
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWorld() {
  const W = MAP_WIDTH;
  const H = MAP_HEIGHT;
  const rng = mulberry32(20261028);
  const ground: Tile[] = new Array(W * H).fill(Tile.Grass);
  const blocked: boolean[] = new Array(W * H).fill(false);
  const objects: MapObject[] = [];

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const get = (x: number, y: number) => ground[y * W + x];
  const set = (x: number, y: number, t: Tile) => {
    if (inside(x, y)) ground[y * W + x] = t;
  };
  const rect = (x: number, y: number, w: number, h: number, t: Tile) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t);
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, t: Tile) => {
    for (let j = Math.floor(cy - ry); j <= cy + ry; j++)
      for (let i = Math.floor(cx - rx); i <= cx + rx; i++)
        if (((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2 <= 1) set(i, j, t);
  };
  const blob = (cx: number, cy: number, rx: number, ry: number, t: Tile) => {
    // forma orgânica: elipse com borda irregular
    for (let j = Math.floor(cy - ry - 1); j <= cy + ry + 1; j++)
      for (let i = Math.floor(cx - rx - 1); i <= cx + rx + 1; i++) {
        const d = ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2;
        if (d <= 1 - 0.18 + rng() * 0.36) set(i, j, t);
      }
  };

  // --- Grama alta: campinas ---
  blob(19, 15, 8, 6, Tile.TallGrass);
  blob(70, 53, 9, 6, Tile.TallGrass);
  blob(21, 52, 7, 5, Tile.TallGrass);
  blob(76, 31, 6, 3, Tile.TallGrass);
  blob(30, 26, 4, 3, Tile.TallGrass);

  // --- Lago com areia ---
  ellipse(73, 14, 13, 7.5, Tile.Sand);
  blob(73, 14, 11, 6, Tile.Water);
  ellipse(14, 34, 3.5, 2.5, Tile.Sand);
  ellipse(14, 34, 2.5, 1.6, Tile.Water);

  // --- Distrito dos Ginásios (sul): terreno limpo para as duas ruas ---
  rect(6, 71, W - 12, 20, Tile.Grass);

  // --- Estradas ---
  rect(5, 36, W - 10, 2, Tile.Path); // leste-oeste
  rect(47, 5, 2, H - 10, Tile.Path); // norte-sul
  rect(40, 31, 16, 12, Tile.Path); // praça
  rect(62, 14 + 8, 2, 14, Tile.Path); // ramal até o lago
  rect(62, 21, 6, 2, Tile.Path);
  rect(19, 22, 2, 14, Tile.Path); // ramal até a campina oeste
  rect(10, GYM_ROWS[0] + 5, W - 20, 2, Tile.Path); // rua dos ginásios (1ª fileira)
  rect(10, GYM_ROWS[1] + 5, W - 20, 2, Tile.Path); // rua dos ginásios (2ª fileira)

  // --- Flores ---
  for (let k = 0; k < 260; k++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * H);
    if (get(x, y) === Tile.Grass) set(x, y, Tile.Flowers);
  }
  // canteiros da praça
  for (const [x, y] of [
    [41, 32], [42, 32], [53, 32], [54, 32], [41, 41], [42, 41], [53, 41], [54, 41],
  ]) set(x, y, Tile.Flowers);

  const free = (x: number, y: number, w: number, h: number, margin = 0) => {
    for (let j = y - margin; j < y + h + margin; j++)
      for (let i = x - margin; i < x + w + margin; i++) {
        if (!inside(i, j)) return false;
        if (blocked[j * W + i]) return false;
      }
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        const t = get(i, j);
        if (t !== Tile.Grass && t !== Tile.Flowers) return false;
      }
    return true;
  };
  const nearPath = (x: number, y: number, w: number, h: number, d: number) => {
    for (let j = y - d; j < y + h + d; j++)
      for (let i = x - d; i < x + w + d; i++) if (inside(i, j) && get(i, j) === Tile.Path) return true;
    return false;
  };
  const place = (kind: ObjectKind, x: number, y: number, variant = 0, force = false, extra: Partial<MapObject> = {}) => {
    const [w, h] = FOOTPRINT[kind];
    if (!force && !free(x, y, w, h)) return false;
    objects.push({ kind, x, y, w, h, variant, ...extra });
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inside(i, j)) blocked[j * W + i] = true;
    return true;
  };

  // --- Vila Broto: casas ao redor da praça (porta virada para a estrada) ---
  rect(43, 29, 1, 2, Tile.Path); // trilha até a porta do Centro de Cura
  rect(52, 29, 1, 2, Tile.Path); // trilha até a porta da Loja
  place("house", 41, 26, 0, true, { role: "heal" });
  place("house", 50, 26, 1, true, { role: "shop" });
  rect(39, 42, 1, 6, Tile.Path); // trilha da praça até a porta da Casa do Treinador
  rect(39, 47, 5, 1, Tile.Path);
  place("house", 41, 44, 2, true, { role: "tutor" }); // Casa do Treinador: troca de golpes
  place("house", 50, 44, 3, true);
  place("house", 33, 31, 1, true);
  place("well", 47, 34 - 1, 0, true);
  for (const [x, y] of [[40, 31], [55, 31], [40, 42], [55, 42]]) place("lamp", x, y, 0, true);
  place("sign", 46, 39, 0, true, {
    text: "Vila Broto. Centro de Cura: casa de telhado vermelho. Loja: telhado azul. Casa do Treinador (telhado verde, ao sul da praça): troque os golpes das suas criaturas. A grama alta das campinas esconde criaturas selvagens!",
  });
  place("sign", 22, 34, 0, true, { text: "Campina Norte, subindo a trilha. Orla do Bosque ao sul." });
  place("sign", 64, 34, 0, true, { text: "Campos do Leste e Lago Espelho ao norte. Pradaria Sul descendo a estrada." });
  // Ginásios: duas fileiras de quatro, porta virada para a rua
  GYMS.forEach((gym, i) => {
    const x = GYM_COLS[i % 4];
    const y = GYM_ROWS[Math.floor(i / 4)];
    const door = { x: x + 3, y: y + 3 };
    set(door.x, door.y + 1, Tile.Path);
    place("gym", x, y, TYPE_IDS.indexOf(gym.type), true, { role: "gym", gymId: gym.id });
    place("npc", door.x + 2, door.y + 1, 0, true, { gymId: gym.id, look: gym.leader.look, name: gym.leader.name });
  });
  place("sign", 45, GYM_ROWS[0] + 2, 0, true, {
    text: "Distrito dos Ginásios. Oito ginásios, um de cada tipo. Vença os treinadores e o líder de cada um para ganhar a insígnia. Na fileira de cima ficam os mais fáceis.",
  });
  place("sign", 49, 66, 0, true, { text: "Ao sul: Distrito dos Ginásios." });

  // cercas dos quintais
  for (let i = 0; i < 6; i++) {
    place("fence", 35 + i, 29, 0, true);
    place("fence", 57 + i, 29, 0, true);
    place("fence", 57 + i, 46, 0, true);
  }
  for (let j = 0; j < 4; j++) place("fence", 62, 26 + j, 1, true);

  // --- Bosque nas bordas (denso) ---
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 2) {
      const edge = Math.min(x, y, W - 2 - x, H - 1 - y);
      if (edge < 3 || (edge < 5 && rng() < 0.55)) {
        const kind = rng() < 0.3 ? "pine" : "tree";
        const ox = x + (y % 2);
        if (kind === "tree") place("tree", ox, y, Math.floor(rng() * 3));
        else place("pine", ox, y, 0);
      }
    }
  }
  // bosque sudoeste e nordeste
  const grove = (cx: number, cy: number, rx: number, ry: number, density: number) => {
    for (let y = cy - ry; y <= cy + ry; y++)
      for (let x = cx - rx; x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
        if (rng() > density) continue;
        if (nearPath(x, y, 2, 1, 1)) continue;
        if (rng() < 0.35) place("pine", x, y, 0);
        else place("tree", x, y, Math.floor(rng() * 3));
      }
  };
  grove(10, 62, 9, 6, 0.55);
  grove(88, 60, 6, 7, 0.5);
  grove(33, 8, 7, 4, 0.45);
  grove(88, 8, 5, 5, 0.5);

  // --- Árvores soltas, arbustos e pedras ---
  for (let k = 0; k < 140; k++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * H);
    if (nearPath(x, y, 2, 1, 2)) continue;
    const r = rng();
    if (r < 0.5) place("tree", x, y, Math.floor(rng() * 3));
    else if (r < 0.75) place("bush", x, y, 0);
    else place("pine", x, y, 0);
  }
  // zona de pedras a leste
  for (let k = 0; k < 40; k++) {
    const x = 80 + Math.floor(rng() * 10);
    const y = 38 + Math.floor(rng() * 14);
    if (!nearPath(x, y, 1, 1, 1)) place("rock", x, y, Math.floor(rng() * 2));
  }

  for (let i = 0; i < W * H; i++) if (ground[i] === Tile.Water) blocked[i] = true;
  // garante que a estrada e o spawn fiquem sempre livres
  blocked[SPAWN.y * W + SPAWN.x] = false;

  return { ground, blocked, objects };
}

const WORLD = buildWorld();

export const MAP_TILES: readonly Tile[] = WORLD.ground;
export const MAP_OBJECTS: readonly MapObject[] = WORLD.objects;
const BLOCKED: readonly boolean[] = WORLD.blocked;

export function tileAt(x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return Tile.Water;
  return MAP_TILES[y * MAP_WIDTH + x];
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
  return !BLOCKED[y * MAP_WIDTH + x];
}

/** Objeto que ocupa um tile (ou undefined). */
export function objectAt(x: number, y: number): MapObject | undefined {
  return MAP_OBJECTS.find((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
}

/** Tile da porta de uma casa (linha de baixo, coluna do meio). */
export function doorOf(o: MapObject) {
  return { x: o.x + Math.floor(o.w / 2), y: o.y + o.h - 1 };
}

/** Caminho mais curto (BFS) até o primeiro tile que satisfaz `goal`. Lista de passos, sem a origem. */
export function findPath(
  from: { x: number; y: number },
  goal: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  const W = MAP_WIDTH;
  const prev = new Int32Array(W * MAP_HEIGHT).fill(-1);
  const start = from.y * W + from.x;
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const x = cur % W;
    const y = (cur - x) / W;
    if (cur !== start && goal(x, y)) {
      const path: { x: number; y: number }[] = [];
      for (let p = cur; p !== start; p = prev[p]) path.push({ x: p % W, y: Math.floor(p / W) });
      return path.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * W + nx;
      if (isWalkable(nx, ny) && prev[n] === -1) {
        prev[n] = cur;
        queue.push(n);
      }
    }
  }
  return null;
}
