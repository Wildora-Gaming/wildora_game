// Controles de toque para celular e tablet: direcional à esquerda, botões de ação à direita.
// Aparecem só em aparelhos de toque (ou com ?toque=1 na URL, para testar no computador).
import "./touch.css";
import type { Direction } from "../../../shared/constants";

export interface TouchHandlers {
  /** direção segurada (null = soltou) */
  move(dir: Direction | null): void;
  interact(): void;
  team(): void;
  bag(): void;
  chat(): void;
}

export function isTouchDevice(): boolean {
  if (new URLSearchParams(window.location.search).has("toque")) return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarse || (navigator.maxTouchPoints > 0 && !window.matchMedia?.("(hover: hover)").matches);
}

/** Marca o documento como "toque" o quanto antes (o CSS das telas usa isso). */
export function markTouch() {
  if (isTouchDevice()) document.documentElement.classList.add("touch");
}

const ARROWS: Record<Direction, string> = { up: "▲", down: "▼", left: "◀", right: "▶" };

export function setupTouch(h: TouchHandlers) {
  if (!isTouchDevice()) return;
  const root = document.createElement("div");
  root.id = "touch";
  root.innerHTML = `
    <div class="dpad" aria-label="Direcional">
      ${(Object.keys(ARROWS) as Direction[]).map((d) => `<span class="dpad-arrow ${d}" data-dir="${d}">${ARROWS[d]}</span>`).join("")}
      <span class="dpad-knob"></span>
    </div>
    <div class="touch-actions">
      <button type="button" class="t-btn t-small" data-act="chat">Chat</button>
      <button type="button" class="t-btn t-small" data-act="bag">Mochila</button>
      <button type="button" class="t-btn t-small" data-act="team">Time</button>
      <button type="button" class="t-btn t-main" data-act="interact" aria-label="Interagir">A</button>
    </div>`;
  document.body.append(root);

  // ---- Direcional: arrastar o dedo muda a direção sem soltar ----
  const pad = root.querySelector<HTMLElement>(".dpad")!;
  const knob = root.querySelector<HTMLElement>(".dpad-knob")!;
  let pointer: number | null = null;
  let current: Direction | null = null;

  const set = (dir: Direction | null) => {
    if (dir === current) return;
    current = dir;
    pad.querySelectorAll<HTMLElement>(".dpad-arrow").forEach((a) => a.classList.toggle("on", a.dataset.dir === dir));
    h.move(dir);
  };

  const fromPoint = (e: PointerEvent) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const max = r.width / 2;
    const len = Math.hypot(dx, dy);
    const k = len > max * 0.55 ? (max * 0.55) / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    // zona morta pequena no centro
    if (len < r.width * 0.12) return set(null);
    set(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  const release = () => {
    pointer = null;
    knob.style.transform = "";
    set(null);
  };

  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pointer = e.pointerId;
    pad.setPointerCapture(e.pointerId);
    fromPoint(e);
  });
  pad.addEventListener("pointermove", (e) => {
    if (e.pointerId === pointer) fromPoint(e);
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    pad.addEventListener(ev, (e) => {
      if (e.pointerId === pointer) release();
    });
  }
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", release);

  // ---- Botões ----
  root.querySelectorAll<HTMLButtonElement>(".t-btn").forEach((b) => {
    b.addEventListener("pointerdown", (e) => e.preventDefault()); // não tira o foco nem dá zoom
    b.addEventListener("click", () => {
      const act = b.dataset.act as keyof Omit<TouchHandlers, "move">;
      release();
      h[act]();
    });
  });

  return root;
}
