// Monta os pixels do personagem a partir dos moldes (parts.json, gerado por tools/avatar/parts.py).
// Não depende de navegador: devolve uma grade de cores; o cliente pinta num canvas.
import parts from "./parts.json";
import {
  BOTTOM_STYLES,
  CLOTH_COLORS,
  EYE_COLORS,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  HAT_STYLES,
  SKIN_COLORS,
  TOP_STYLES,
  type Look,
} from "./look";

export const AVATAR_W = parts.w;
export const AVATAR_H = parts.h;
export type AvatarDir = "down" | "up" | "left" | "right";
export const AVATAR_DIRS: AvatarDir[] = ["down", "left", "right", "up"];
export const AVATAR_FRAMES = ["stand", "stepA", "stepB"] as const;
export type AvatarFrame = (typeof AVATAR_FRAMES)[number];

type Grid = string[];
type Layered = Record<string, Grid>;

const FIXED: Record<string, string> = { K: "#2a2233", W: "#ffffff", I: "#f4f1e8", m: "#b8584a", R: "#f3a5a0" };

function palette(look: Look): Record<string, string> {
  const [S, s] = SKIN_COLORS[look.skin];
  const [Hc, h] = HAIR_COLORS[look.hairColor];
  const [E] = EYE_COLORS[look.eyeColor];
  const [T, t] = CLOTH_COLORS[look.topColor];
  const [P, p] = CLOTH_COLORS[look.bottomColor];
  const [B] = CLOTH_COLORS[look.shoesColor];
  const [C, c] = CLOTH_COLORS[look.hatColor];
  return { ...FIXED, S, s, H: Hc, h, E, T, t, P, p, B, C, c };
}

/** Grade 16x24 de cores (null = transparente) para uma direção e quadro. */
export function composeAvatar(look: Look, dir: AvatarDir, frame: AvatarFrame): (string | null)[][] {
  const src = dir === "right" ? "left" : dir;
  const base = (parts.base as Record<string, Grid>)[`${src}:${frame}`];
  const px = base.map((row) => row.split(""));

  for (const [d, r, c, k] of (parts.tops as unknown as Record<string, [string, number, number, string][]>)[TOP_STYLES[look.top]]) {
    if (d === src && px[r][c] !== "." && px[r][c] !== "K") px[r][c] = k;
  }

  const bottom = (parts.bottoms as unknown as Record<string, { skinFrom: number; overlay: Layered | null }>)[BOTTOM_STYLES[look.bottom]];
  for (let r = bottom.skinFrom; r < AVATAR_H; r++) {
    for (let c = 0; c < AVATAR_W; c++) if (px[r][c] === "P" || px[r][c] === "p") px[r][c] = "S";
  }

  const layers: Grid[] = [];
  if (bottom.overlay) layers.push(bottom.overlay[src]);
  if (src !== "up") layers.push((parts.eyes as unknown as Record<string, Layered>)[EYE_STYLES[look.eyes]][src]);
  layers.push((parts.hair as unknown as Record<string, Layered>)[HAIR_STYLES[look.hair]][src]);
  const hat = (parts.hats as unknown as Record<string, Layered | null>)[HAT_STYLES[look.hat]];
  if (hat) layers.push(hat[src]);

  for (const layer of layers) {
    for (let r = 0; r < AVATAR_H; r++) {
      const row = layer[r];
      for (let c = 0; c < AVATAR_W; c++) if (row[c] !== ".") px[r][c] = row[c];
    }
  }

  const pal = palette(look);
  const out = px.map((row) => row.map((k) => (k === "." ? null : pal[k] ?? null)));
  return dir === "right" ? out.map((row) => row.reverse()) : out;
}
