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
function nativeCanvas(speciesId: string, types: TypeId[]): HTMLCanvasElement {
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
