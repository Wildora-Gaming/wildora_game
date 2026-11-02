// Símbolos dos tipos (7x7 pixels, desenho original do Wildora).
import { TYPE_COLOR, TYPE_LABEL, type TypeId } from "../../shared/battle/types";

const ICONS: Record<TypeId, string[]> = {
  flora: ["...1...", "..111..", ".11111.", ".11111.", "..111..", "...1...", "..1...."],
  brasa: ["...1...", "..11...", "..111..", ".11111.", ".11.11.", ".11111.", "..111.."],
  mare: ["...1...", "...1...", "..111..", ".11111.", ".11111.", ".11111.", "..111.."],
  pedra: [".......", "..111..", ".11111.", "1111111", "1111111", ".11111.", "......."],
  vento: ["1111...", "....1..", "111111.", "......1", "11111..", ".....1.", "111...."],
  faisca: ["...111.", "..111..", ".111...", "111111.", "...111.", "..111..", ".11...."],
  fera: [".1...1.", "1.1.1.1", ".1...1.", "..111..", ".11111.", ".11111.", "..111.."],
  espectro: ["..111..", ".11111.", "1.1.1.1", "1111111", "1111111", "1111111", "1.1.1.1"],
  veneno: [".11111.", "1111111", "1.111.1", "1111111", ".11111.", "..1.1..", "..1.1.."],
  gelo: ["...1...", ".1.1.1.", "..111..", "1111111", "..111..", ".1.1.1.", "...1..."],
  luz: ["1..1..1", ".1.1.1.", "..111..", "1111111", "..111..", ".1.1.1.", "1..1..1"],
  psiquico: [".......", "..111..", ".1...1.", "1..1..1", ".1...1.", "..111..", "......."],
  sombrio: ["..111..", ".11....", "111....", "111....", "111....", ".11....", "..111.."],
};

function svg(t: TypeId) {
  const rects = ICONS[t]
    .flatMap((row, y) => [...row].map((ch, x) => (ch === "1" ? `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>` : "")))
    .join("");
  return `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><g fill="#fff">${rects}</g></svg>`;
}

/** Quadradinho colorido com o símbolo do tipo. */
export function typeIcon(t: TypeId, size = 18): HTMLElement {
  const span = document.createElement("span");
  span.className = "type-icon";
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.style.background = TYPE_COLOR[t];
  span.title = TYPE_LABEL[t];
  span.setAttribute("aria-label", TYPE_LABEL[t]);
  span.innerHTML = svg(t);
  return span;
}

/** Chip com símbolo + nome do tipo (Livro, caixa, time). */
export function typeChip(t: TypeId): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "c-type";
  chip.style.background = TYPE_COLOR[t];
  const icon = typeIcon(t, 13);
  icon.style.background = "transparent";
  chip.append(icon, document.createTextNode(TYPE_LABEL[t]));
  return chip;
}
