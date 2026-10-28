// Gera a folha de sprites do personagem num canvas e registra no Phaser.
import Phaser from "phaser";
import {
  AVATAR_DIRS,
  AVATAR_FRAMES,
  AVATAR_H,
  AVATAR_W,
  composeAvatar,
  type AvatarDir,
  type AvatarFrame,
} from "../../../shared/avatar/compose";
import { encodeLook, parseLook, type Look } from "../../../shared/avatar/look";

/** Desenha um quadro do personagem num contexto, na escala pedida. */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  look: Look,
  dir: AvatarDir,
  frame: AvatarFrame,
  x = 0,
  y = 0,
  scale = 1,
) {
  const grid = composeAvatar(look, dir, frame);
  for (let r = 0; r < AVATAR_H; r++) {
    for (let c = 0; c < AVATAR_W; c++) {
      const color = grid[r][c];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

/** Folha: colunas = quadros (parado, passo A, passo B), linhas = direções (baixo, esq, dir, cima). */
export function avatarSheet(look: Look): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_W * AVATAR_FRAMES.length;
  canvas.height = AVATAR_H * AVATAR_DIRS.length;
  const ctx = canvas.getContext("2d")!;
  AVATAR_DIRS.forEach((dir, row) =>
    AVATAR_FRAMES.forEach((frame, col) => drawAvatar(ctx, look, dir, frame, col * AVATAR_W, row * AVATAR_H)),
  );
  return canvas;
}

export function frameIndex(dir: AvatarDir, frame: AvatarFrame) {
  return AVATAR_DIRS.indexOf(dir) * AVATAR_FRAMES.length + AVATAR_FRAMES.indexOf(frame);
}

/** Registra textura e animações para uma aparência (uma vez por aparência). Devolve a chave. */
export function ensureAvatar(scene: Phaser.Scene, lookCode: string): string {
  const code = encodeLook(parseLook(lookCode));
  const key = `avatar:${code}`;
  if (scene.textures.exists(key)) return key;

  const tex = scene.textures.addCanvas(key, avatarSheet(parseLook(code)))!;
  for (let i = 0; i < AVATAR_DIRS.length * AVATAR_FRAMES.length; i++) {
    const col = i % AVATAR_FRAMES.length;
    const row = Math.floor(i / AVATAR_FRAMES.length);
    tex.add(i, 0, col * AVATAR_W, row * AVATAR_H, AVATAR_W, AVATAR_H);
  }
  for (const dir of AVATAR_DIRS) {
    scene.anims.create({
      key: `${key}:walk-${dir}`,
      frames: [
        { key, frame: frameIndex(dir, "stepA") },
        { key, frame: frameIndex(dir, "stand") },
        { key, frame: frameIndex(dir, "stepB") },
        { key, frame: frameIndex(dir, "stand") },
      ],
      frameRate: 9,
      repeat: -1,
    });
  }
  return key;
}
