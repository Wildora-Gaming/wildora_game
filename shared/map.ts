import { GYMS } from "./gyms";
import { TYPE_IDS } from "./battle/types";
// Mundo de Wildora (versão 2): 256×192 tiles com a Vila Broto no centro.
// Gerado por código de forma determinística: cliente e servidor chegam ao mesmo mundo.
// Oito biomas com bordas irregulares que se misturam aos poucos, estradas sinuosas ligando a vila
// aos oito ginásios (espalhados pelos biomas, os mais fortes mais longe) e clareiras dos lendários.
// Duas camadas: o chão (um tipo por tile) e objetos (árvores, casas, pedras...) que bloqueiam
// a área da base e podem ser desenhados mais altos que ela.

export enum Tile {
  Grass = 0,
  Path = 1,
  TallGrass = 2,
  Water = 3,
  Sand = 4,
  Flowers = 5,
  Snow = 6,
  Ash = 7,
  Moss = 8,
  /** grama alta de cada bioma (todas dão encontros) */
  FrostGrass = 9,
  EmberGrass = 10,
  GlowGrass = 11,
  SeaGrass = 12,
  Lava = 13,
  Ice = 14,
}

/** Tiles com criaturas selvagens escondidas. */
export const WILD_TILES: ReadonlySet<Tile> = new Set([Tile.TallGrass, Tile.FrostGrass, Tile.EmberGrass, Tile.GlowGrass, Tile.SeaGrass]);
export const isWildTile = (t: Tile) => WILD_TILES.has(t);

export type ObjectKind =
  | "tree" | "pine" | "house" | "rock" | "fence" | "lamp" | "sign" | "bush" | "well" | "gym" | "npc" | "palm" | "mushroom";

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

/** Versão do mundo. Quem foi salvo numa versão anterior volta para a Vila Broto ao entrar. */
export const WORLD_VERSION = 2;
export const MAP_WIDTH = 256;
export const MAP_HEIGHT = 192;

/** Deslocamento da Vila Broto em relação ao mapa antigo (a vila é a mesma, só mudou de lugar). */
const V = { x: 80, y: 63 };
export const SPAWN = { x: 47 + V.x, y: 37 + V.y };
/** Em frente à porta do Centro de Cura: onde o jogador volta após perder. */
export const HEAL_POINT = { x: 43 + V.x, y: 29 + V.y };
/** Área da Vila Broto */
export const VILLAGE = { x0: 108, y0: 84, x1: 148, y1: 116 };

// ---------------- Biomas ----------------

export interface Biome {
  id: string;
  name: string;
  /** chão e grama alta */
  floor: Tile;
  wild: Tile;
  /** pontos que puxam o bioma (o tile pertence ao bioma do ponto mais perto, com bordas irregulares) */
  seeds: [number, number][];
}

export const BIOMES: Biome[] = [
  { id: "campina", name: "Campina Norte", floor: Tile.Grass, wild: Tile.TallGrass, seeds: [[128, 60], [104, 66]] },
  { id: "leste", name: "Campos do Leste", floor: Tile.Grass, wild: Tile.TallGrass, seeds: [[174, 98], [166, 120]] },
  { id: "sul", name: "Pradaria Sul", floor: Tile.Grass, wild: Tile.TallGrass, seeds: [[128, 142], [150, 156]] },
  { id: "bosque", name: "Orla do Bosque", floor: Tile.Grass, wild: Tile.TallGrass, seeds: [[82, 100], [50, 78], [92, 126]] },
  { id: "gelada", name: "Planície Gelada", floor: Tile.Snow, wild: Tile.FrostGrass, seeds: [[96, 20], [150, 18], [40, 30]] },
  { id: "encantado", name: "Bosque Encantado", floor: Tile.Moss, wild: Tile.GlowGrass, seeds: [[218, 38], [198, 62], [232, 76]] },
  { id: "vulcao", name: "Encosta Vulcânica", floor: Tile.Ash, wild: Tile.EmberGrass, seeds: [[44, 158], [74, 178], [22, 124]] },
  { id: "recife", name: "Costa dos Recifes", floor: Tile.Sand, wild: Tile.SeaGrass, seeds: [[214, 150], [196, 178], [236, 118]] },
];
const BIOME_INDEX: Record<string, number> = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));

/** Onde cada ginásio fica (canto superior esquerdo do prédio). Os mais fortes ficam mais longe da vila. */
const GYM_SITES: Record<string, { x: number; y: number }> = {
  fera: { x: 172, y: 100 }, // Campos do Leste
  flora: { x: 74, y: 94 }, // Orla do Bosque
  faisca: { x: 140, y: 148 }, // Pradaria Sul
  mare: { x: 208, y: 146 }, // Costa dos Recifes
  pedra: { x: 56, y: 146 }, // Encosta Vulcânica
  vento: { x: 96, y: 22 }, // Planície Gelada
  brasa: { x: 30, y: 172 }, // fundo da Encosta Vulcânica
  espectro: { x: 214, y: 34 }, // Bosque Encantado
};

/** Onde cada lendário aparece durante o evento (clareira no meio do bioma). */
export const LEGEND_SPOTS: Record<string, { x: number; y: number; region: string; /** "na Planície Gelada", "no Bosque Encantado" */ at: string }> = {
  solvaris: { x: 150, y: 14, region: "Planície Gelada", at: "na Planície Gelada" },
  nocteon: { x: 236, y: 56, region: "Bosque Encantado", at: "no Bosque Encantado" },
  terralith: { x: 20, y: 140, region: "Encosta Vulcânica", at: "na Encosta Vulcânica" },
  abyssion: { x: 226, y: 172, region: "Costa dos Recifes", at: "na Costa dos Recifes" },
};

/** Lago Espelho, entre a Campina Norte e os Campos do Leste. */
const LAKE = { x: 160, y: 72, rx: 12, ry: 7 };

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
  palm: [1, 1],
  mushroom: [1, 1],
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruído suave (0–1) numa grade de `scale` tiles. */
function noise(x: number, y: number, scale: number, s: number) {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s);
  const b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s);
  const d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function buildWorld() {
  const W = MAP_WIDTH;
  const H = MAP_HEIGHT;
  const rng = mulberry32(20261030);
  const ground: Tile[] = new Array(W * H).fill(Tile.Grass);
  const blocked: boolean[] = new Array(W * H).fill(false);
  /** bioma de cada tile (o que vale para encontros e nome da região) */
  const biome = new Uint8Array(W * H);
  /** área reservada: sem grama alta nem árvores (vila, ginásios, clareiras) */
  const reserved = new Uint8Array(W * H);
  const objects: MapObject[] = [];

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const get = (x: number, y: number) => ground[y * W + x];
  const set = (x: number, y: number, t: Tile) => {
    if (inside(x, y)) ground[y * W + x] = t;
  };
  const rect = (x: number, y: number, w: number, h: number, t: Tile) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t);
  };
  const reserve = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inside(i, j)) reserved[j * W + i] = 1;
  };
  const floorAt = (x: number, y: number) => BIOMES[biome[y * W + x]].floor;
  const blob = (cx: number, cy: number, rx: number, ry: number, t: Tile, only?: (x: number, y: number) => boolean) => {
    for (let j = Math.floor(cy - ry - 1); j <= cy + ry + 1; j++)
      for (let i = Math.floor(cx - rx - 1); i <= cx + rx + 1; i++) {
        if (!inside(i, j)) continue;
        const d = ((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2;
        if (d <= 1 - 0.18 + rng() * 0.36 && (!only || only(i, j))) set(i, j, t);
      }
  };

  // ---------- 1. Biomas: ponto mais perto, com bordas tortas e mistura na fronteira ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let best = -1;
      let d1 = Infinity;
      let second = -1;
      let d2 = Infinity;
      BIOMES.forEach((b, i) => {
        const warp = (noise(x, y, 26, i * 7 + 1) - 0.5) * 34 + (noise(x, y, 9, i * 7 + 2) - 0.5) * 10;
        let d = Infinity;
        for (const [sx, sy] of b.seeds) d = Math.min(d, Math.hypot(x - sx, (y - sy) * 1.15));
        d += warp;
        if (d < d1) {
          second = best;
          d2 = d1;
          best = i;
          d1 = d;
        } else if (d < d2) {
          second = i;
          d2 = d;
        }
      });
      biome[y * W + x] = best;
      // faixa de transição: perto da fronteira o chão do vizinho aparece salpicado
      const gap = d2 - d1;
      const band = 7;
      const useSecond = second >= 0 && gap < band && hash2(x, y, 77) < (1 - gap / band) * 0.5;
      ground[y * W + x] = BIOMES[useSecond ? second : best].floor;
    }
  // flores espalhadas nos campos (mais nos Campos do Leste)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (get(x, y) !== Tile.Grass) continue;
      const b = BIOMES[biome[y * W + x]].id;
      const p = b === "leste" ? 0.07 : b === "campina" || b === "sul" ? 0.025 : 0.012;
      if (hash2(x, y, 5) < p) set(x, y, Tile.Flowers);
    }

  // ---------- 2. Água, lava e gelo ----------
  // mar a leste e sudeste (Costa dos Recifes)
  for (let y = 0; y < H; y++) {
    const shore = 240 + Math.round((noise(0, y, 14, 91) - 0.5) * 12);
    for (let x = shore; x < W; x++) if (BIOMES[biome[y * W + x]].id === "recife") set(x, y, Tile.Water);
  }
  for (let x = 160; x < W; x++) {
    const shore = 184 + Math.round((noise(x, 0, 12, 92) - 0.5) * 8);
    for (let y = shore; y < H; y++) if (BIOMES[biome[y * W + x]].id === "recife") set(x, y, Tile.Water);
  }
  // Lago Espelho com areia em volta
  blob(LAKE.x, LAKE.y, LAKE.rx + 2, LAKE.ry + 2, Tile.Sand);
  blob(LAKE.x, LAKE.y, LAKE.rx, LAKE.ry, Tile.Water);
  const inBiome = (id: string) => (x: number, y: number) => BIOMES[biome[y * W + x]].id === id;
  // lagos congelados, lagoas encantadas, lava e laguinhos do bosque
  for (const [x, y, rx, ry] of [[70, 34, 8, 5], [128, 28, 7, 4], [30, 52, 5, 4], [176, 24, 6, 4]]) blob(x, y, rx, ry, Tile.Ice, inBiome("gelada"));
  for (const [x, y, rx, ry] of [[238, 38, 6, 5], [206, 80, 5, 4], [190, 44, 4, 3]]) blob(x, y, rx, ry, Tile.Water, inBiome("encantado"));
  for (const [x, y, rx, ry] of [[40, 176, 7, 5], [16, 160, 4, 6], [80, 160, 4, 3], [60, 128, 3, 4]]) blob(x, y, rx, ry, Tile.Lava, inBiome("vulcao"));
  for (const [x, y, rx, ry] of [[56, 108, 4, 3], [96, 140, 3, 2]]) blob(x, y, rx, ry, Tile.Water, inBiome("bosque"));

  // ---------- 3. Vila Broto (a mesma de antes, no centro do mundo) ----------
  rect(VILLAGE.x0, VILLAGE.y0, VILLAGE.x1 - VILLAGE.x0, VILLAGE.y1 - VILLAGE.y0, Tile.Grass);
  reserve(VILLAGE.x0, VILLAGE.y0, VILLAGE.x1 - VILLAGE.x0, VILLAGE.y1 - VILLAGE.y0);
  const vx = (x: number) => x + V.x;
  const vy = (y: number) => y + V.y;
  rect(VILLAGE.x0, vy(36), VILLAGE.x1 - VILLAGE.x0, 2, Tile.Path); // leste-oeste
  rect(vx(47), VILLAGE.y0, 2, VILLAGE.y1 - VILLAGE.y0, Tile.Path); // norte-sul
  rect(vx(40), vy(31), 16, 12, Tile.Path); // praça
  for (const [x, y] of [[41, 32], [42, 32], [53, 32], [54, 32], [41, 41], [42, 41], [53, 41], [54, 41]]) set(vx(x), vy(y), Tile.Flowers);
  for (let k = 0; k < 70; k++) {
    const x = VILLAGE.x0 + Math.floor(rng() * (VILLAGE.x1 - VILLAGE.x0));
    const y = VILLAGE.y0 + Math.floor(rng() * (VILLAGE.y1 - VILLAGE.y0));
    if (get(x, y) === Tile.Grass) set(x, y, Tile.Flowers);
  }

  const free = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (!inside(i, j) || blocked[j * W + i]) return false;
        const t = get(i, j);
        if (t === Tile.Path || t === Tile.Water || t === Tile.Lava || t === Tile.Ice || isWildTile(t)) return false;
      }
    return true;
  };
  const place = (kind: ObjectKind, x: number, y: number, variant = 0, force = false, extra: Partial<MapObject> = {}) => {
    const [w, h] = FOOTPRINT[kind];
    if (!force && !free(x, y, w, h)) return false;
    objects.push({ kind, x, y, w, h, variant, ...extra });
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inside(i, j)) blocked[j * W + i] = true;
    return true;
  };

  rect(vx(43), vy(29), 1, 2, Tile.Path); // trilha até a porta do Centro de Cura
  rect(vx(52), vy(29), 1, 2, Tile.Path); // trilha até a porta da Loja
  place("house", vx(41), vy(26), 0, true, { role: "heal" });
  place("house", vx(50), vy(26), 1, true, { role: "shop" });
  rect(vx(39), vy(42), 1, 6, Tile.Path); // trilha da praça até a porta da Casa do Treinador
  rect(vx(39), vy(47), 5, 1, Tile.Path);
  place("house", vx(41), vy(44), 2, true, { role: "tutor" });
  place("house", vx(50), vy(44), 3, true);
  place("house", vx(33), vy(31), 1, true);
  place("well", vx(47), vy(33), 0, true);
  for (const [x, y] of [[40, 31], [55, 31], [40, 42], [55, 42]]) place("lamp", vx(x), vy(y), 0, true);
  place("sign", vx(46), vy(39), 0, true, {
    text: "Vila Broto. Centro de Cura: casa de telhado vermelho. Loja: telhado azul. Casa do Treinador (telhado verde, ao sul da praça): troque os golpes das suas criaturas. Os oito ginásios ficam espalhados pelo mundo: abra o Mapa (tecla M) para ver onde.",
  });
  for (let i = 0; i < 6; i++) {
    place("fence", vx(35 + i), vy(29), 0, true);
    place("fence", vx(57 + i), vy(29), 0, true);
    place("fence", vx(57 + i), vy(46), 0, true);
  }
  for (let j = 0; j < 4; j++) place("fence", vx(62), vy(26 + j), 1, true);

  // ---------- 4. Ginásios espalhados, cada um com Posto de Cura ----------
  const gymDoors: Record<string, { x: number; y: number }> = {};
  for (const gym of GYMS) {
    const { x, y } = GYM_SITES[gym.id];
    const b = biome[(y + 2) * W + x + 3];
    // terreno limpo em volta
    for (let j = y - 3; j < y + 8; j++) for (let i = x - 4; i < x + 19; i++) set(i, j, BIOMES[b].floor);
    reserve(x - 4, y - 3, 23, 11);
    rect(x - 1, y + 4, 17, 2, Tile.Path); // calçada na frente
    place("gym", x, y, TYPE_IDS.indexOf(gym.type), true, { role: "gym", gymId: gym.id });
    const door = { x: x + 3, y: y + 3 };
    place("npc", door.x + 2, door.y + 1, 0, true, { gymId: gym.id, look: gym.leader.look, name: gym.leader.name });
    place("house", x + 9, y + 1, 0, true, { role: "heal" });
    place("sign", x - 2, y + 3, 0, true, {
      text: `${gym.name}: ${gym.badge}. Nível ${gym.level}. Ao lado, um Posto de Cura.`,
    });
    gymDoors[gym.id] = { x: door.x, y: y + 5 };
  }

  // ---------- 5. Clareiras dos lendários ----------
  for (const spot of Object.values(LEGEND_SPOTS)) {
    for (let j = spot.y - 2; j <= spot.y + 2; j++) for (let i = spot.x - 3; i <= spot.x + 3; i++) if (inside(i, j)) set(i, j, floorAt(i, j));
    reserve(spot.x - 4, spot.y - 3, 9, 7);
  }

  // ---------- 6. Estradas sinuosas (A* com custo irregular) ----------
  const cost = (x: number, y: number) => {
    const t = get(x, y);
    if (t === Tile.Water || t === Tile.Lava) return Infinity;
    if (blocked[y * W + x]) return Infinity;
    if (t === Tile.Path) return 0.6;
    return 1 + noise(x, y, 11, 55) * 9 + noise(x, y, 4, 56) * 2 + (t === Tile.Ice ? 3 : 0);
  };
  const road = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const N = W * H;
    const g = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap: [number, number][] = [];
    const push = (f: number, n: number) => {
      heap.push([f, n]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    const start = from.y * W + from.x;
    const goal = to.y * W + to.x;
    g[start] = 0;
    push(0, start);
    while (heap.length) {
      const [, cur] = pop();
      if (cur === goal) break;
      const cx = cur % W;
      const cy = (cur - cx) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!inside(nx, ny)) continue;
        const n = ny * W + nx;
        const c = n === goal ? 1 : cost(nx, ny);
        if (c === Infinity) continue;
        const ng = g[cur] + c;
        if (ng < g[n]) {
          g[n] = ng;
          prev[n] = cur;
          push(ng + (Math.abs(nx - to.x) + Math.abs(ny - to.y)) * 0.9, n);
        }
      }
    }
    for (let p = goal; p !== -1 && p !== start; p = prev[p]) {
      const x = p % W;
      const y = (p - x) / W;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = x + dx;
        const j = y + dy;
        if (inside(i, j) && !blocked[j * W + i] && get(i, j) !== Tile.Water && get(i, j) !== Tile.Lava) set(i, j, Tile.Path);
      }
    }
  };
  const north = { x: vx(47), y: VILLAGE.y0 };
  const south = { x: vx(47), y: VILLAGE.y1 - 1 };
  const west = { x: VILLAGE.x0, y: vy(36) };
  const east = { x: VILLAGE.x1 - 1, y: vy(36) };
  road(east, gymDoors.fera);
  road(gymDoors.fera, gymDoors.espectro);
  road(gymDoors.fera, gymDoors.mare);
  road(south, gymDoors.faisca);
  road(gymDoors.faisca, gymDoors.mare);
  road(west, gymDoors.flora);
  road(gymDoors.flora, gymDoors.pedra);
  road(gymDoors.pedra, gymDoors.brasa);
  road(north, gymDoors.vento);
  road(north, { x: LAKE.x - 6, y: LAKE.y + LAKE.ry + 4 });

  // ---------- 7. Grama alta de cada bioma ----------
  const counts = new Array(BIOMES.length).fill(0);
  for (let i = 0; i < W * H; i++) counts[biome[i]]++;
  BIOMES.forEach((b, bi) => {
    const patches = Math.round(counts[bi] / 260);
    for (let k = 0, tries = 0; k < patches && tries < patches * 20; tries++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(rng() * H);
      if (biome[y * W + x] !== bi || reserved[y * W + x]) continue;
      const rx = 3 + rng() * 4;
      const ry = 2 + rng() * 3;
      blob(x, y, rx, ry, b.wild, (i, j) => {
        const t = get(i, j);
        return !reserved[j * W + i] && biome[j * W + i] === bi && (t === b.floor || t === Tile.Flowers);
      });
      k++;
    }
  });

  // ---------- 8. Vegetação de cada bioma ----------
  const nearPath = (x: number, y: number, w: number, h: number, d: number) => {
    for (let j = y - d; j < y + h + d; j++)
      for (let i = x - d; i < x + w + d; i++) if (inside(i, j) && get(i, j) === Tile.Path) return true;
    return false;
  };
  const DECOR: Record<string, [number, () => [ObjectKind, number]]> = {
    campina: [0.025, () => (rng() < 0.6 ? ["tree", Math.floor(rng() * 3)] : rng() < 0.6 ? ["bush", 0] : ["pine", 0])],
    leste: [0.02, () => (rng() < 0.5 ? ["bush", 0] : ["tree", Math.floor(rng() * 3)])],
    sul: [0.022, () => (rng() < 0.5 ? ["tree", Math.floor(rng() * 3)] : rng() < 0.5 ? ["rock", Math.floor(rng() * 2)] : ["bush", 0])],
    bosque: [0.11, () => (rng() < 0.65 ? ["tree", Math.floor(rng() * 3)] : ["pine", 0])],
    gelada: [0.045, () => (rng() < 0.85 ? ["pine", 1] : ["rock", 0])],
    encantado: [0.07, () => { const r = rng(); return r < 0.55 ? ["tree", 3] : r < 0.85 ? ["mushroom", 0] : ["pine", 0]; }],
    vulcao: [0.05, () => { const r = rng(); return r < 0.55 ? ["rock", 2] : r < 0.85 ? ["tree", 4] : ["rock", 0]; }],
    recife: [0.03, () => (rng() < 0.75 ? ["palm", 0] : ["rock", 0])],
  };
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (reserved[i]) continue;
      const [p, pick] = DECOR[BIOMES[biome[i]].id];
      if (hash2(x, y, 31) >= p) continue;
      if (nearPath(x, y, 2, 1, 1)) continue;
      const [kind, variant] = pick();
      const [w, h] = FOOTPRINT[kind];
      let ok = true;
      for (let j = y; j < y + h && ok; j++) for (let k = x; k < x + w; k++) if (reserved[j * W + k]) ok = false;
      if (ok) place(kind, x, y, variant);
    }

  // ---------- 9. Borda do mundo ----------
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge >= 4) continue;
      if (edge >= 2 && hash2(x, y, 41) > 0.5) continue;
      const t = get(x, y);
      if (t === Tile.Water || t === Tile.Lava) continue;
      if (t === Tile.Path) set(x, y, floorAt(x, y));
      const id = BIOMES[biome[y * W + x]].id;
      if (id === "gelada") place("pine", x, y, 1);
      else if (id === "encantado") place(hash2(x, y, 3) < 0.6 ? "tree" : "pine", x, y, hash2(x, y, 3) < 0.6 ? 3 : 0);
      else if (id === "vulcao") place("rock", x, y, 2);
      else if (id === "recife") place("palm", x, y, 0);
      else place(hash2(x, y, 3) < 0.35 ? "pine" : "tree", x, y, Math.floor(hash2(x, y, 4) * 3));
    }

  // placas nas saídas da vila
  place("sign", north.x - 2, north.y + 1, 0, true, { text: "Norte: Campina Norte, Lago Espelho e, bem mais longe, a Planície Gelada (Ginásio Vento)." });
  place("sign", east.x - 1, east.y - 2, 0, true, { text: "Leste: Campos do Leste (Ginásio Garra). Depois: Bosque Encantado ao norte e Costa dos Recifes ao sul." });
  place("sign", south.x - 2, south.y - 1, 0, true, { text: "Sul: Pradaria Sul (Ginásio Faísca) e a Costa dos Recifes a sudeste." });
  place("sign", west.x + 1, west.y - 2, 0, true, { text: "Oeste: Orla do Bosque (Ginásio Raiz). Depois do bosque, a Encosta Vulcânica." });

  for (let i = 0; i < W * H; i++) if (ground[i] === Tile.Water || ground[i] === Tile.Lava) blocked[i] = true;
  blocked[SPAWN.y * W + SPAWN.x] = false;

  // índice de objetos por tile (para objectAt ser rápido)
  const objAt = new Int32Array(W * H).fill(-1);
  objects.forEach((o, k) => {
    for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) if (inside(i, j)) objAt[j * W + i] = k;
  });
  return { ground, blocked, objects, biome, objAt };
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

/** Bioma de um tile (para encontros e nome da região). */
export function biomeAt(x: number, y: number): Biome {
  const cx = Math.max(0, Math.min(MAP_WIDTH - 1, x));
  const cy = Math.max(0, Math.min(MAP_HEIGHT - 1, y));
  return BIOMES[WORLD.biome[cy * MAP_WIDTH + cx]];
}
export const biomeIndex = (id: string) => BIOME_INDEX[id];

export function inVillage(x: number, y: number) {
  return x >= VILLAGE.x0 && x < VILLAGE.x1 && y >= VILLAGE.y0 && y < VILLAGE.y1;
}
export function nearLake(x: number, y: number) {
  return ((x - LAKE.x) / (LAKE.rx + 4)) ** 2 + ((y - LAKE.y) / (LAKE.ry + 4)) ** 2 <= 1;
}

/** Objeto que ocupa um tile (ou undefined). */
export function objectAt(x: number, y: number): MapObject | undefined {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return undefined;
  const k = WORLD.objAt[y * MAP_WIDTH + x];
  return k >= 0 ? MAP_OBJECTS[k] : undefined;
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
