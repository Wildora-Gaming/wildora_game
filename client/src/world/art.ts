// Arte do mundo em pixel art, desenhada por código num canvas (16 px por tile).
// Para trocar por um tileset desenhado à mão no futuro, basta substituir estas funções
// por imagens carregadas no preload.
import { MAP_HEIGHT, MAP_WIDTH, Tile, tileAt, type MapObject, type ObjectKind } from "../../../shared/map";

export const TILE = 16;
const OUT = "#2a2233";

function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Ctx = CanvasRenderingContext2D;
const px = (c: Ctx, x: number, y: number, color: string, w = 1, h = 1) => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};

// ---------------- Chão ----------------

const G = { base: "#79c25a", dark: "#5ea84a", light: "#98d873" };

function grass(c: Ctx, ox: number, oy: number, tx: number, ty: number) {
  px(c, ox, oy, G.base, TILE, TILE);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(hash(tx, ty, i) * 15);
    const y = Math.floor(hash(tx, ty, i + 20) * 14) + 1;
    px(c, ox + x, oy + y, G.dark);
    px(c, ox + x, oy + y - 1, G.dark);
    if (i < 3) px(c, ox + ((x + 5) % 15), oy + ((y + 7) % 15), G.light);
  }
}

function flowers(c: Ctx, ox: number, oy: number, tx: number, ty: number) {
  grass(c, ox, oy, tx, ty);
  const colors = ["#e5484d", "#f2c53d", "#ffffff", "#e87ab0", "#8db3ea"];
  const n = 2 + Math.floor(hash(tx, ty, 99) * 2);
  for (let i = 0; i < n; i++) {
    const x = 2 + Math.floor(hash(tx, ty, 40 + i) * 11);
    const y = 2 + Math.floor(hash(tx, ty, 60 + i) * 11);
    const col = colors[Math.floor(hash(tx, ty, 80 + i) * colors.length)];
    px(c, ox + x, oy + y - 1, col);
    px(c, ox + x - 1, oy + y, col);
    px(c, ox + x + 1, oy + y, col);
    px(c, ox + x, oy + y + 1, col);
    px(c, ox + x, oy + y, "#f7e27a");
    px(c, ox + x, oy + y + 2, G.dark);
  }
}

function path(c: Ctx, ox: number, oy: number, tx: number, ty: number) {
  px(c, ox, oy, "#e3c98f", TILE, TILE);
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(hash(tx, ty, i + 5) * 15);
    const y = Math.floor(hash(tx, ty, i + 9) * 15);
    px(c, ox + x, oy + y, i < 4 ? "#c9ab6c" : "#f0deb2", i === 0 ? 2 : 1, 1);
  }
  const edge = "#b89660";
  const isPath = (x: number, y: number) => tileAt(x, y) === Tile.Path;
  if (!isPath(tx, ty - 1)) px(c, ox, oy, edge, TILE, 1);
  if (!isPath(tx, ty + 1)) px(c, ox, oy + TILE - 1, edge, TILE, 1);
  if (!isPath(tx - 1, ty)) px(c, ox, oy, edge, 1, TILE);
  if (!isPath(tx + 1, ty)) px(c, ox + TILE - 1, oy, edge, 1, TILE);
}

function sand(c: Ctx, ox: number, oy: number, tx: number, ty: number) {
  px(c, ox, oy, "#f0dca0", TILE, TILE);
  for (let i = 0; i < 5; i++) {
    px(c, ox + Math.floor(hash(tx, ty, i + 3) * 16), oy + Math.floor(hash(tx, ty, i + 7) * 16), "#d9c07e");
  }
}

function water(c: Ctx, ox: number, oy: number, tx: number, ty: number) {
  px(c, ox, oy, "#4aa3df", TILE, TILE);
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(hash(tx, ty, i + 1) * 11);
    const y = 3 + Math.floor(hash(tx, ty, i + 4) * 10);
    px(c, ox + x, oy + y, "#8dcdf2", 4, 1);
    px(c, ox + x + 1, oy + y + 1, "#3a8fcc", 3, 1);
  }
  const isW = (x: number, y: number) => tileAt(x, y) === Tile.Water;
  const foam = "#dff4ff";
  const deep = "#3a86c8";
  if (!isW(tx, ty - 1)) { px(c, ox, oy, foam, TILE, 2); px(c, ox, oy + 2, deep, TILE, 1); }
  if (!isW(tx, ty + 1)) px(c, ox, oy + TILE - 2, foam, TILE, 2);
  if (!isW(tx - 1, ty)) px(c, ox, oy, foam, 2, TILE);
  if (!isW(tx + 1, ty)) px(c, ox + TILE - 2, oy, foam, 2, TILE);
}

function tallGrass(c: Ctx, ox: number, oy: number, tx: number, ty: number, withBase = true) {
  if (withBase) px(c, ox, oy, "#5aa84a", TILE, TILE);
  const tuft = (x: number, y: number) => {
    // moita de 7 px: contorno escuro, folhas, brilho
    const dark = "#2f7a32";
    const mid = "#3f9440";
    const hi = "#8fd46a";
    for (let k = 0; k < 7; k++) px(c, ox + x + k, oy + y + 6, dark);
    px(c, ox + x, oy + y + 2, dark, 1, 4);
    px(c, ox + x + 1, oy + y + 3, mid, 1, 3);
    px(c, ox + x + 2, oy + y, dark, 1, 6);
    px(c, ox + x + 3, oy + y + 1, mid, 1, 5);
    px(c, ox + x + 4, oy + y + 2, dark, 1, 4);
    px(c, ox + x + 5, oy + y + 1, mid, 1, 5);
    px(c, ox + x + 6, oy + y + 3, dark, 1, 3);
    px(c, ox + x + 3, oy + y + 1, hi);
    px(c, ox + x + 5, oy + y + 2, hi);
  };
  tuft(0, 0);
  tuft(8, 1);
  tuft(4, 8);
  tuft(11, 8 + (hash(tx, ty) < 0.5 ? 0 : 1));
}

/** Moitas da grama alta sem o fundo: desenhadas na frente das pernas de quem está nela. */
export function grassOverlay(): HTMLCanvasElement {
  const full = document.createElement("canvas");
  full.width = TILE;
  full.height = TILE;
  tallGrass(full.getContext("2d")!, 0, 0, 0, 0, false);
  const out = document.createElement("canvas");
  out.width = TILE;
  out.height = 9;
  out.getContext("2d")!.drawImage(full, 0, 7, TILE, 9, 0, 0, TILE, 9);
  return out;
}

export function renderGround(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_WIDTH * TILE;
  canvas.height = MAP_HEIGHT * TILE;
  const c = canvas.getContext("2d")!;
  for (let ty = 0; ty < MAP_HEIGHT; ty++) {
    for (let tx = 0; tx < MAP_WIDTH; tx++) {
      const ox = tx * TILE;
      const oy = ty * TILE;
      switch (tileAt(tx, ty)) {
        case Tile.Grass: grass(c, ox, oy, tx, ty); break;
        case Tile.Flowers: flowers(c, ox, oy, tx, ty); break;
        case Tile.Path: path(c, ox, oy, tx, ty); break;
        case Tile.Sand: sand(c, ox, oy, tx, ty); break;
        case Tile.Water: water(c, ox, oy, tx, ty); break;
        case Tile.TallGrass: tallGrass(c, ox, oy, tx, ty); break;
      }
    }
  }
  return canvas;
}

// ---------------- Objetos ----------------

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext("2d")!];
}

/** Disco em pixel art com contorno e luz no canto superior esquerdo. */
function blobShape(c: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string, light: string, shade: string) {
  for (let y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const dOut = ((x - cx) / (rx + 1)) ** 2 + ((y - cy) / (ry + 1)) ** 2;
      if (d <= 1) {
        const lx = (x - cx) / rx;
        const ly = (y - cy) / ry;
        const col = lx + ly < -0.7 ? light : lx + ly > 0.6 ? shade : fill;
        px(c, x, y, col);
      } else if (dOut <= 1) px(c, x, y, OUT);
    }
  }
}

const TREE_COLORS = [
  ["#3d8a3c", "#5fae4d", "#2b6b2e"],
  ["#4a9a3a", "#76c254", "#33752a"],
  ["#2f7a4a", "#4ea066", "#225c37"],
];

function drawTree(variant: number) {
  const [cv, c] = canvas(32, 40);
  // tronco
  px(c, 12, 26, OUT, 8, 14);
  px(c, 13, 26, "#7a4a24", 6, 13);
  px(c, 13, 26, "#94603a", 2, 13);
  px(c, 11, 38, OUT, 10, 2);
  // copa em 3 cachos
  const [f, l, s] = TREE_COLORS[variant % TREE_COLORS.length];
  blobShape(c, 16, 15, 14, 12, f, l, s);
  blobShape(c, 10, 11, 7, 6, f, l, s);
  blobShape(c, 21, 10, 7, 6, f, l, s);
  // brilhos
  px(c, 8, 8, l, 3, 1);
  px(c, 19, 7, l, 3, 1);
  px(c, 12, 15, s, 2, 1);
  px(c, 22, 17, s, 3, 1);
  return cv;
}

function drawPine() {
  const [cv, c] = canvas(16, 32);
  px(c, 6, 25, OUT, 4, 7);
  px(c, 7, 25, "#7a4a24", 2, 6);
  const tier = (top: number, half: number, height: number) => {
    for (let y = 0; y < height; y++) {
      const w = Math.round((half * (y + 1)) / height);
      px(c, 8 - w - 1, top + y, OUT, 1, 1);
      px(c, 8 + w, top + y, OUT, 1, 1);
      px(c, 8 - w, top + y, "#2f7a4a", w, 1);
      px(c, 8, top + y, "#225c37", w, 1);
      px(c, 8 - w, top + y, "#4ea066", 1, 1);
    }
    px(c, 8 - half - 1, top + height, OUT, half * 2 + 2, 1);
  };
  px(c, 7, 1, OUT, 2, 1);
  tier(2, 4, 7);
  tier(8, 6, 8);
  tier(15, 7, 9);
  return cv;
}

const ROOF = [
  ["#d9433f", "#a82f2c"],
  ["#3a86c8", "#2a66a0"],
  ["#3c9a5f", "#2c7547"],
  ["#e8a43a", "#c4802a"],
];

function drawHouse(variant: number, role?: string) {
  const [cv, c] = canvas(80, 80);
  const [roof, roofShade] = ROOF[variant % ROOF.length];
  // paredes (48 px de altura na base)
  px(c, 4, 36, OUT, 72, 44);
  px(c, 5, 37, "#f4ead2", 70, 42);
  px(c, 5, 37, "#e6d9b8", 70, 3);
  for (let x = 5; x < 75; x += 10) px(c, x, 40, "#e6d9b8", 1, 39);
  // janelas
  for (const wx of [12, 56]) {
    px(c, wx - 1, 47, OUT, 14, 12);
    px(c, wx, 48, "#8dcdf2", 12, 10);
    px(c, wx, 48, "#cdeeff", 5, 4);
    px(c, wx + 5, 48, OUT, 1, 10);
    px(c, wx, 53, OUT, 12, 1);
    px(c, wx - 2, 59, "#a5824c", 16, 2);
  }
  // porta
  px(c, 33, 54, OUT, 14, 26);
  px(c, 34, 55, "#94603a", 12, 25);
  px(c, 34, 55, "#7a4a24", 12, 2);
  px(c, 43, 67, "#f2c53d", 2, 2);
  px(c, 30, 78, "#c9ab6c", 20, 2);
  // telhado
  for (let y = 0; y < 38; y++) {
    const inset = Math.max(0, 14 - Math.floor(y * 0.75));
    px(c, inset, y + 2, OUT, 80 - inset * 2, 1);
    if (y > 0) px(c, inset + 1, y + 2, y % 6 < 3 ? roof : roofShade, 78 - inset * 2, 1);
  }
  px(c, 0, 39, OUT, 80, 2);
  px(c, 1, 37, roofShade, 78, 2);
  // chaminé
  px(c, 58, 0, OUT, 9, 12);
  px(c, 59, 1, "#b0705a", 7, 10);
  // placa sobre a porta
  if (role) {
    px(c, 31, 42, OUT, 18, 11);
    px(c, 32, 43, "#fffaf0", 16, 9);
    if (role === "heal") {
      px(c, 38, 44, "#e5484d", 4, 7);
      px(c, 36, 46, "#e5484d", 8, 3);
    } else if (role === "tutor") {
      // livro aberto: a Casa do Treinador ensina golpes
      px(c, 34, 45, "#7a5cc4", 12, 6);
      px(c, 35, 45, "#fffaf0", 4, 5);
      px(c, 41, 45, "#fffaf0", 4, 5);
      px(c, 39, 44, OUT, 2, 7);
      px(c, 36, 47, "#9aa0b4", 2, 1);
      px(c, 42, 47, "#9aa0b4", 2, 1);
    } else {
      blobShape(c, 40, 47, 3, 3, "#2bb3a3", "#6fd8cc", "#1b8075");
      px(c, 37, 47, OUT, 7, 1);
    }
  }
  return cv;
}

function drawRock(variant: number) {
  const [cv, c] = canvas(16, 16);
  blobShape(c, 8, 9, 6 + variant, 5, "#a7a39b", "#cfccc4", "#7f7b74");
  px(c, 5, 7, "#e3e0d8", 2, 1);
  return cv;
}

function drawBush() {
  const [cv, c] = canvas(16, 16);
  blobShape(c, 8, 9, 6, 5, "#4a9a3a", "#76c254", "#33752a");
  px(c, 5, 6, "#e5484d");
  px(c, 10, 9, "#e5484d");
  return cv;
}

function drawFence(variant: number) {
  const [cv, c] = canvas(16, 16);
  const wood = "#c9935a";
  const shade = "#94603a";
  if (variant === 0) {
    px(c, 0, 5, OUT, 16, 4);
    px(c, 0, 6, wood, 16, 2);
    px(c, 0, 10, OUT, 16, 4);
    px(c, 0, 11, wood, 16, 2);
    px(c, 6, 2, OUT, 4, 14);
    px(c, 7, 3, wood, 2, 12);
    px(c, 8, 3, shade, 1, 12);
  } else {
    px(c, 6, 0, OUT, 4, 16);
    px(c, 7, 0, wood, 2, 16);
    px(c, 8, 0, shade, 1, 16);
  }
  return cv;
}

function drawLamp() {
  const [cv, c] = canvas(16, 32);
  px(c, 6, 8, OUT, 4, 24);
  px(c, 7, 9, "#5a5a6a", 2, 22);
  px(c, 4, 29, OUT, 8, 3);
  px(c, 3, 1, OUT, 10, 9);
  px(c, 4, 2, "#f7e27a", 8, 6);
  px(c, 4, 2, "#fff6c2", 3, 3);
  px(c, 3, 0, OUT, 10, 2);
  return cv;
}

function drawSign() {
  const [cv, c] = canvas(16, 16);
  px(c, 7, 9, OUT, 2, 7);
  px(c, 1, 2, OUT, 14, 9);
  px(c, 2, 3, "#c9935a", 12, 7);
  px(c, 4, 5, "#7a4a24", 8, 1);
  px(c, 4, 7, "#7a4a24", 6, 1);
  return cv;
}

function drawWell() {
  const [cv, c] = canvas(32, 32);
  px(c, 4, 4, OUT, 24, 3);
  px(c, 5, 5, "#d9433f", 22, 2);
  px(c, 6, 6, OUT, 2, 14);
  px(c, 24, 6, OUT, 2, 14);
  blobShape(c, 16, 23, 11, 6, "#a7a39b", "#cfccc4", "#7f7b74");
  blobShape(c, 16, 21, 7, 3, "#2a5aa0", "#3a86c8", "#1f4a85");
  return cv;
}


// ---------------- Ginásios ----------------

/** Ícones 7x7 dos tipos (1 = pixel aceso), na ordem de TYPE_IDS. */
const TYPE_ICONS: string[][] = [
  // flora: folha
  ["...1...", "..111..", ".11111.", ".11111.", "..111..", "...1...", "..1...."],
  // brasa: chama
  ["...1...", "..11...", "..111..", ".11111.", ".11.11.", ".11111.", "..111.."],
  // maré: gota
  ["...1...", "...1...", "..111..", ".11111.", ".11111.", ".11111.", "..111.."],
  // pedra: rocha
  ["..111..", ".11111.", "1111111", "1111111", "1111111", ".11111.", "......."],
  // vento: rajadas
  ["1111...", "....1..", "111111.", "......1", "11111..", ".....1.", "111...."],
  // faísca: raio
  ["...111.", "..111..", ".111...", "111111.", "...111.", "..111..", ".11...."],
  // fera: pegada
  [".1...1.", "1.1.1.1", ".1...1.", "..111..", ".11111.", ".11111.", "..111.."],
  // espectro: fantasma
  ["..111..", ".11111.", "1.1.1.1", "1111111", "1111111", "1111111", "1.1.1.1"],
];
const TYPE_ROOF: [string, string][] = [
  ["#5bb04a", "#3f8a35"],
  ["#e8692f", "#b84d1f"],
  ["#3a86c8", "#2a66a0"],
  ["#9a8f80", "#746a5d"],
  ["#7fbde3", "#5a98c2"],
  ["#f2c53d", "#c4952f"],
  ["#b08560", "#86613f"],
  ["#7b5ea7", "#5b4199"],
];

function drawGym(variant: number) {
  const W = 112;
  const H = 104;
  const [cv, c] = canvas(W, H);
  const [roof, roofShade] = TYPE_ROOF[variant % TYPE_ROOF.length];
  const wallTop = 46;
  // paredes de pedra clara
  px(c, 2, wallTop, OUT, W - 4, H - wallTop);
  px(c, 3, wallTop + 1, "#e9e3d3", W - 6, H - wallTop - 2);
  for (let y = wallTop + 8; y < H - 2; y += 8) px(c, 3, y, "#d6cdb6", W - 6, 1);
  for (let y = wallTop + 1, k = 0; y < H - 2; y += 8, k++)
    for (let x = 3 + (k % 2) * 8; x < W - 3; x += 16) px(c, x, y, "#d6cdb6", 1, 7);
  // faixa colorida do tipo
  px(c, 3, wallTop + 2, roof, W - 6, 4);
  // colunas
  for (const x of [10, W - 18]) {
    px(c, x - 1, wallTop, OUT, 10, H - wallTop);
    px(c, x, wallTop + 1, "#fffaf0", 8, H - wallTop - 2);
    px(c, x + 6, wallTop + 1, "#d6cdb6", 2, H - wallTop - 2);
  }
  // porta dupla
  const dx = W / 2 - 12;
  px(c, dx - 1, H - 30, OUT, 26, 30);
  px(c, dx, H - 29, "#7a4a24", 24, 29);
  px(c, dx, H - 29, roof, 24, 3);
  px(c, dx + 11, H - 26, OUT, 2, 26);
  px(c, dx + 8, H - 14, "#f2c53d", 2, 2);
  px(c, dx + 14, H - 14, "#f2c53d", 2, 2);
  // janelas
  for (const wx of [24, W - 38]) {
    px(c, wx - 1, wallTop + 12, OUT, 16, 14);
    px(c, wx, wallTop + 13, "#8dcdf2", 14, 12);
    px(c, wx, wallTop + 13, "#cdeeff", 6, 5);
    px(c, wx + 7, wallTop + 13, OUT, 1, 12);
  }
  // telhado escalonado
  for (let y = 0; y < wallTop - 6; y++) {
    const inset = Math.max(0, 22 - Math.floor(y * 0.6));
    px(c, inset, y + 6, OUT, W - inset * 2, 1);
    if (y > 0) px(c, inset + 1, y + 6, y % 6 < 3 ? roof : roofShade, W - inset * 2 - 2, 1);
  }
  px(c, 0, wallTop - 1, OUT, W, 2);
  // emblema do tipo no frontão
  const ex = W / 2 - 9;
  const ey = 10;
  blobShape(c, W / 2, ey + 9, 10, 10, "#fffaf0", "#ffffff", "#e6ddc6");
  const icon = TYPE_ICONS[variant % TYPE_ICONS.length];
  icon.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "1") px(c, ex + 2 + x * 2, ey + 2 + y * 2, roofShade, 2, 2);
  });
  return cv;
}

function drawNpc() {
  // o NPC é desenhado pela cena com a aparência dele; aqui só um marcador vazio
  const [cv] = canvas(16, 16);
  return cv;
}

const DRAW: Record<ObjectKind, (variant: number, role?: string) => HTMLCanvasElement> = {
  tree: drawTree,
  pine: drawPine,
  house: drawHouse,
  rock: drawRock,
  bush: drawBush,
  fence: drawFence,
  lamp: drawLamp,
  sign: drawSign,
  well: drawWell,
  gym: drawGym,
  npc: drawNpc,
};

const cache = new Map<string, HTMLCanvasElement>();

/** Canvas do objeto. O desenho é alinhado pela base: fundo do canvas = fundo da área bloqueada. */
export function objectArt(o: MapObject): HTMLCanvasElement {
  const key = `${o.kind}:${o.variant}:${o.role ?? ""}`;
  let cv = cache.get(key);
  if (!cv) {
    cv = DRAW[o.kind](o.variant, o.role);
    cache.set(key, cv);
  }
  return cv;
}

export function objectKey(o: MapObject) {
  return `obj-${o.kind}-${o.variant}-${o.role ?? ""}`;
}
