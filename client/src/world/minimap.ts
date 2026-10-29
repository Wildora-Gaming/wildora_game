// Minimapa (canto da tela, em volta do jogador) e mapa grande (tecla M), desenhados a partir do mundo.
import { BIOMES, LEGEND_SPOTS, MAP_HEIGHT, MAP_OBJECTS, MAP_TILES, MAP_WIDTH, VILLAGE, biomeAt, doorOf, type MapObject } from "../../../shared/map";
import { GYMS } from "../../../shared/gyms";
import { TYPE_COLOR } from "../../../shared/battle/types";
import { SPECIES } from "../../../shared/battle/data";
import { TILE_COLOR } from "./art";
import { el, openModal } from "../panels/panels";

const W = MAP_WIDTH;
const H = MAP_HEIGHT;

export interface MapMarkers {
  me: { x: number; y: number } | null;
  others: { x: number; y: number }[];
  legend: { speciesId: string; x: number; y: number } | null;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return [r, g, b];
}

let base: HTMLCanvasElement | null = null;

/** Mundo inteiro a 1 pixel por tile: chão, árvores mais escuras, construções. */
function baseCanvas(): HTMLCanvasElement {
  if (base) return base;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const rgb = new Map<string, number[]>();
  const col = (hex: string, f = 1) => {
    const k = hex + f;
    let v = rgb.get(k);
    if (!v) rgb.set(k, (v = shade(hex, f)));
    return v;
  };
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = col(TILE_COLOR[MAP_TILES[i]]);
    img.data.set([r, g, b, 255], i * 4);
  }
  for (const o of MAP_OBJECTS) {
    if (o.kind === "npc" || o.kind === "lamp" || o.kind === "fence" || o.kind === "sign") continue;
    const building = o.kind === "house" || o.kind === "gym" || o.kind === "well";
    for (let j = o.y; j < o.y + o.h; j++)
      for (let i = o.x; i < o.x + o.w; i++) {
        const k = j * W + i;
        const [r, g, b] = building ? [232, 222, 196] : col(TILE_COLOR[MAP_TILES[k]], 0.55);
        img.data.set([r, g, b, 255], k * 4);
      }
  }
  ctx.putImageData(img, 0, 0);
  return (base = c);
}

const gymObjects = () => MAP_OBJECTS.filter((o) => o.kind === "gym");
const healObjects = () => MAP_OBJECTS.filter((o) => o.role === "heal");

function drawIcon(ctx: CanvasRenderingContext2D, kind: "gym" | "heal", o: MapObject, s: number, ox: number, oy: number, r: number) {
  const d = doorOf(o);
  const x = (d.x + 0.5) * s - ox;
  const y = (d.y + 0.5) * s - oy;
  if (kind === "gym") {
    const gym = GYMS.find((g) => g.id === o.gymId);
    ctx.fillStyle = gym ? TYPE_COLOR[gym.type] : "#fff";
    ctx.strokeStyle = "#1f2430";
    ctx.lineWidth = Math.max(1, r / 3);
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    const a = Math.max(1, Math.round(r * 0.45));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = "#e5484d";
    ctx.fillRect(x - a / 2, y - r + 1, a, r * 2 - 2);
    ctx.fillRect(x - r + 1, y - a / 2, r * 2 - 2, a);
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = "#ffd84a";
  ctx.strokeStyle = "#1f2430";
  ctx.lineWidth = Math.max(1, r / 4);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, me: boolean) {
  ctx.fillStyle = me ? "#ffe066" : "#ffffff";
  ctx.strokeStyle = "#1f2430";
  ctx.lineWidth = Math.max(1, r / 2.5);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ---------------- Minimapa ----------------

/** Tiles mostrados no minimapa e escala (px por tile). */
const MINI = { tiles: 64, scale: 2 };

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(private getMarkers: () => MapMarkers, onOpen: () => void) {
    const root = document.getElementById("minimap") ?? el("div");
    root.id = "minimap";
    root.title = "Mapa (M)";
    this.canvas = el("canvas");
    this.canvas.width = MINI.tiles * MINI.scale;
    this.canvas.height = Math.round(MINI.tiles * 0.75) * MINI.scale;
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    root.replaceChildren(this.canvas);
    root.addEventListener("click", onOpen);
    document.body.append(root);
    root.hidden = false;
  }

  draw() {
    const m = this.getMarkers();
    if (!m.me) return;
    const s = MINI.scale;
    const tw = this.canvas.width / s;
    const th = this.canvas.height / s;
    const tx = Math.max(0, Math.min(W - tw, m.me.x - Math.floor(tw / 2)));
    const ty = Math.max(0, Math.min(H - th, m.me.y - Math.floor(th / 2)));
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baseCanvas(), tx, ty, tw, th, 0, 0, tw * s, th * s);
    const ox = tx * s;
    const oy = ty * s;
    for (const o of healObjects()) drawIcon(ctx, "heal", o, s, ox, oy, 3);
    for (const o of gymObjects()) drawIcon(ctx, "gym", o, s, ox, oy, 4);
    if (m.legend) drawStar(ctx, (m.legend.x + 0.5) * s - ox, (m.legend.y + 0.5) * s - oy, 5);
    for (const p of m.others) drawPlayer(ctx, (p.x + 0.5) * s - ox, (p.y + 0.5) * s - oy, 2, false);
    drawPlayer(ctx, (m.me.x + 0.5) * s - ox, (m.me.y + 0.5) * s - oy, 3, true);
  }

  setVisible(v: boolean) {
    const root = document.getElementById("minimap");
    if (root) root.hidden = !v;
  }
}

// ---------------- Mapa grande ----------------

let labels: { name: string; x: number; y: number }[] | null = null;

/** Centro de cada bioma (para escrever o nome no mapa). */
function regionLabels() {
  if (labels) return labels;
  const sum = BIOMES.map(() => [0, 0, 0]);
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const b = BIOMES.indexOf(biomeAt(x, y));
      sum[b][0] += x;
      sum[b][1] += y;
      sum[b][2] += 1;
    }
  labels = BIOMES.map((b, i) => ({ name: b.name, x: sum[i][0] / sum[i][2], y: sum[i][1] / sum[i][2] }));
  // nomes dos campos perto da vila: afasta do centro para não cobrir a Vila Broto
  const vx = (VILLAGE.x0 + VILLAGE.x1) / 2;
  const vy = (VILLAGE.y0 + VILLAGE.y1) / 2;
  for (const l of labels) {
    const dx = l.x - vx;
    const dy = l.y - vy;
    const d = Math.hypot(dx, dy);
    if (d < 34) {
      l.x = vx + (dx / (d || 1)) * 34;
      l.y = vy + (dy / (d || 1)) * 30;
    }
  }
  // não escreve em cima de um ginásio: sobe o nome
  for (const l of labels)
    for (const g of MAP_OBJECTS)
      if (g.kind === "gym" && Math.abs(g.x + 3 - l.x) < 18 && Math.abs(g.y + 4 - l.y) < 9) l.y = g.y - 6;
  labels.push({ name: "Vila Broto", x: vx, y: VILLAGE.y0 - 3 });
  return labels;
}

export function openWorldMap(getMarkers: () => MapMarkers) {
  const body = el("div", "modal-body world-map");
  const wrap = el("div", "world-map-canvas");
  const canvas = el("canvas");
  wrap.append(canvas);
  const legendBox = el("div", "world-map-legend");
  body.append(wrap, legendBox);
  openModal("map", "Mapa de Wildora", body, { wide: true });

  const draw = () => {
    const m = getMarkers();
    // escala: cabe na largura disponível (no mínimo 2 px por tile)
    const avail = Math.max(240, Math.min(wrap.clientWidth || 720, 1100)) * Math.min(2, window.devicePixelRatio || 1);
    const s = Math.max(2, Math.ceil(avail / W));
    canvas.width = W * s;
    canvas.height = H * s;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(baseCanvas(), 0, 0, W * s, H * s);
    for (const o of healObjects()) drawIcon(ctx, "heal", o, s, 0, 0, Math.max(3, s * 1.6));
    for (const o of gymObjects()) drawIcon(ctx, "gym", o, s, 0, 0, Math.max(4, s * 2.4));
    // nomes das regiões
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const font = Math.max(10, Math.round(s * 4.2));
    ctx.font = `700 ${font}px "Pixelify Sans", system-ui, sans-serif`;
    ctx.lineJoin = "round";
    for (const l of regionLabels()) {
      ctx.lineWidth = Math.max(3, font / 4);
      ctx.strokeStyle = "rgba(20,24,34,0.85)";
      ctx.strokeText(l.name, l.x * s, l.y * s);
      ctx.fillStyle = l.name === "Vila Broto" ? "#ffe066" : "#ffffff";
      ctx.fillText(l.name, l.x * s, l.y * s);
    }
    // nomes dos ginásios
    ctx.font = `700 ${Math.max(9, Math.round(font * 0.72))}px "Pixelify Sans", system-ui, sans-serif`;
    for (const o of gymObjects()) {
      const gym = GYMS.find((g) => g.id === o.gymId);
      if (!gym) continue;
      const d = doorOf(o);
      const label = `${gym.name.replace("Ginásio ", "")} · Nv. ${gym.level}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(20,24,34,0.85)";
      ctx.strokeText(label, (d.x + 0.5) * s, (d.y + 0.5) * s + s * 4.5);
      ctx.fillStyle = "#ffe9b0";
      ctx.fillText(label, (d.x + 0.5) * s, (d.y + 0.5) * s + s * 4.5);
    }
    if (m.legend) drawStar(ctx, (m.legend.x + 0.5) * s, (m.legend.y + 0.5) * s, Math.max(6, s * 3));
    for (const p of m.others) drawPlayer(ctx, (p.x + 0.5) * s, (p.y + 0.5) * s, Math.max(2, s), false);
    if (m.me) drawPlayer(ctx, (m.me.x + 0.5) * s, (m.me.y + 0.5) * s, Math.max(4, s * 2.2), true);

    legendBox.replaceChildren();
    const item = (cls: string, text: string) => {
      const row = el("span", "wm-item");
      row.append(el("i", `wm-key ${cls}`), document.createTextNode(text));
      return row;
    };
    legendBox.append(item("me", "Você"), item("other", "Outros treinadores"), item("gym", "Ginásio"), item("heal", "Centro / Posto de Cura"));
    if (m.legend) legendBox.append(item("star", `Lendário: ${SPECIES[m.legend.speciesId]?.name ?? ""} (${LEGEND_SPOTS[m.legend.speciesId]?.region ?? ""})`));
  };
  requestAnimationFrame(draw);
  // enquanto estiver aberto, atualiza jogadores e lendário
  const timer = window.setInterval(() => {
    if (!canvas.isConnected) window.clearInterval(timer);
    else draw();
  }, 1000);
}
