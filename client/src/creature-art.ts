// Pixel art das criaturas, desenhada por código a partir de client/src/creatures/pixels.json
// (gerado por tools/creatures/pixelize.py). Sempre em escala inteira: cada pixel da arte vira
// um bloco quadrado de N pixels na tela, sem suavização.
import pixels from "./creatures/pixels.json";
import { TYPE_COLOR, type TypeId } from "../../shared/battle/types";

interface PixelSprite {
  w: number;
  h: number;
  palette: string[];
  rows: string[];
}

const SPRITES = pixels as Record<string, PixelSprite>;
const CHARS = "abcdefghijklmnopqrstuvwxyz";
const cache = new Map<string, HTMLCanvasElement>();

export function spriteSize(speciesId: string): { w: number; h: number } {
  const s = SPRITES[speciesId];
  return s ? { w: s.w, h: s.h } : { w: 24, h: 24 };
}

/** Canvas no tamanho natural (1 pixel da arte = 1 pixel do canvas). */
export function nativeCanvas(speciesId: string, types: TypeId[]): HTMLCanvasElement {
  const key = speciesId;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = SPRITES[speciesId];
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  if (s) {
    c.width = s.w;
    c.height = s.h;
    s.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === ".") continue;
        ctx.fillStyle = s.palette[CHARS.indexOf(ch)];
        ctx.fillRect(x, y, 1, 1);
      }
    });
  } else {
    // criatura sem arte ainda: bolinha na cor do tipo
    c.width = 24;
    c.height = 24;
    ctx.fillStyle = "#221c2c";
    ctx.beginPath();
    ctx.arc(12, 13, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TYPE_COLOR[types[0]] ?? "#999";
    ctx.beginPath();
    ctx.arc(12, 13, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#221c2c";
    ctx.fillRect(8, 11, 2, 3);
    ctx.fillRect(14, 11, 2, 3);
  }
  cache.set(key, c);
  return c;
}

export interface ArtOptions {
  /** Escala inteira exata (tem prioridade sobre `box`). */
  scale?: number;
  /** Maior escala inteira que cabe num quadrado deste tamanho (px). */
  box?: number;
  /** Espelha na horizontal (sua criatura na batalha olha para o inimigo). */
  mirror?: boolean;
}

export function creatureArt(speciesId: string, name: string, types: TypeId[], opts: ArtOptions = {}): HTMLElement {
  const native = nativeCanvas(speciesId, types);
  const scale = opts.scale ?? Math.max(1, Math.floor((opts.box ?? 64) / Math.max(native.width, native.height)));

  const canvas = document.createElement("canvas");
  canvas.width = native.width * scale;
  canvas.height = native.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (opts.mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(native, 0, 0, canvas.width, canvas.height);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", name);

  const box = document.createElement("div");
  box.className = "creature-art";
  box.append(canvas);
  return box;
}

const miniCache = new Map<string, HTMLCanvasElement>();

/**
 * Versão pequena da arte para andar no mapa atrás do treinador: reduzida com suavização
 * e depois "endurecida" (transparência tudo-ou-nada) para continuar com cara de pixel art.
 */
export function miniCanvas(speciesId: string, types: TypeId[], height: number): HTMLCanvasElement {
  const key = `${speciesId}:${height}`;
  const hit = miniCache.get(key);
  if (hit) return hit;
  const src = nativeCanvas(speciesId, types);
  const scale = Math.min(1, height / src.height);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  // reduz em etapas (metade por vez) para não perder detalhe
  let cur: HTMLCanvasElement = src;
  while (cur.width / 2 > w && cur.height / 2 > h) {
    const half = document.createElement("canvas");
    half.width = Math.ceil(cur.width / 2);
    half.height = Math.ceil(cur.height / 2);
    const hc = half.getContext("2d")!;
    hc.imageSmoothingEnabled = true;
    hc.imageSmoothingQuality = "high";
    hc.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cur, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  miniCache.set(key, out);
  return out;
}
