// Criação de personagem (passo 1) e escolha da criatura inicial (passo 2).
import "./creator.css";
import {
  BOTTOM_STYLES,
  CLOTH_COLORS,
  DEFAULT_LOOK,
  EYE_COLORS,
  EYE_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  HAT_STYLES,
  SKIN_COLORS,
  STYLE_LABEL,
  TOP_STYLES,
  encodeLook,
  parseLook,
  randomLook,
  type Look,
  type Swatch,
} from "../../../shared/avatar/look";
import { AVATAR_FRAMES, AVATAR_H, AVATAR_W, type AvatarDir } from "../../../shared/avatar/compose";
import { SPECIES, STARTERS, type SpeciesId } from "../../../shared/battle/data";
import { TYPE_COLOR, TYPE_LABEL, type TypeId } from "../../../shared/battle/types";
import { drawAvatar } from "../avatar/sheet";
import { creatureArt } from "../creature-art";

export interface CreatorResult {
  name: string;
  look: string;
  starter: SpeciesId;
}

const STORAGE_KEY = "wildora:perfil";

const STARTER_BLURB: Record<string, string> = {
  leafin: "Calmo e resistente. Aguenta o tranco e coloca os outros para dormir.",
  flambo: "Rápido e explosivo. Bate forte, mas é frágil.",
  aquari: "Equilibrado em tudo. Uma ótima primeira companhia.",
};

function load(): Partial<CreatorResult> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function save(data: CreatorResult) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* sem armazenamento: tudo bem */
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function avatarCanvas(look: Look, dir: AvatarDir, scale: number, frame: (typeof AVATAR_FRAMES)[number] = "stand") {
  const c = document.createElement("canvas");
  c.width = AVATAR_W * scale;
  c.height = AVATAR_H * scale;
  drawAvatar(c.getContext("2d")!, look, dir, frame, 0, 0, scale);
  return c;
}

export function runCreator(root: HTMLElement): Promise<CreatorResult> {
  const saved = load();
  let look: Look = parseLook(saved.look ?? encodeLook(DEFAULT_LOOK));
  let name = saved.name ?? "";
  let starter: SpeciesId = saved.starter && STARTERS.includes(saved.starter) ? saved.starter : STARTERS[0];

  return new Promise((resolve) => {
    root.replaceChildren();
    const shell = el("div", "creator");
    root.append(shell);

    // ============ Passo 1: personagem ============
    const showStep1 = () => {
      shell.replaceChildren();
      const head = el("header", "creator-head");
      head.append(el("h1", "", "Wildora"), el("span", "step", "Passo 1 de 2 · Crie seu personagem"));

      const options = el("section", "panel options");
      options.append(el("h2", "", "Personalização do personagem"));
      const optionsBody = el("div", "panel-body");
      options.append(optionsBody);

      const preview = el("section", "panel preview");
      preview.append(el("h2", "", "Prévia"));
      const previewBody = el("div", "panel-body");
      const stage = el("div", "stage");
      const views: { dir: AvatarDir; canvas: HTMLCanvasElement }[] = (["down", "left", "up"] as AvatarDir[]).map(
        (dir) => ({ dir, canvas: avatarCanvas(look, dir, 7) }),
      );
      for (const v of views) stage.append(v.canvas);

      const nameLabel = el("label", "field-label", "Nome do treinador");
      const nameInput = el("input", "name-input") as HTMLInputElement;
      nameInput.maxLength = 16;
      nameInput.placeholder = "Seu nome";
      nameInput.value = name;
      nameInput.addEventListener("input", () => (name = nameInput.value));

      const actions = el("div", "preview-actions");
      const random = el("button", "btn ghost", "Aleatório");
      random.type = "button";
      const next = el("button", "btn primary", "Próximo");
      next.type = "button";
      actions.append(random, next);
      previewBody.append(stage, nameLabel, nameInput, actions);
      preview.append(previewBody);

      // animação de caminhada na prévia
      let tick = 0;
      const cycle: (typeof AVATAR_FRAMES)[number][] = ["stepA", "stand", "stepB", "stand"];
      const anim = window.setInterval(() => {
        tick++;
        for (const v of views) {
          const ctx = v.canvas.getContext("2d")!;
          ctx.clearRect(0, 0, v.canvas.width, v.canvas.height);
          drawAvatar(ctx, look, v.dir, cycle[tick % 4], 0, 0, 7);
        }
      }, 180);

      const rows: (() => void)[] = [];
      const refresh = () => rows.forEach((r) => r());

      const styleRow = (label: string, field: keyof Look, styles: readonly string[], dir: AvatarDir = "down") => {
        const row = el("div", "opt-row");
        row.append(el("div", "opt-label", label));
        const list = el("div", "opt-styles");
        row.append(list);
        const render = () => {
          list.replaceChildren(
            ...styles.map((s, i) => {
              const b = el("button", "style-chip");
              b.type = "button";
              b.title = STYLE_LABEL[s] ?? s;
              b.setAttribute("aria-pressed", String(look[field] === i));
              b.append(avatarCanvas({ ...look, [field]: i }, dir, 3), el("span", "", STYLE_LABEL[s] ?? s));
              b.addEventListener("click", () => {
                look = { ...look, [field]: i };
                refresh();
              });
              return b;
            }),
          );
        };
        rows.push(render);
        optionsBody.append(row);
      };

      const colorRow = (label: string, field: keyof Look, swatches: Swatch[]) => {
        const row = el("div", "opt-row");
        row.append(el("div", "opt-label", label));
        const list = el("div", "opt-swatches");
        row.append(list);
        const render = () => {
          list.replaceChildren(
            ...swatches.map(([color], i) => {
              const b = el("button", "swatch");
              b.type = "button";
              b.style.background = color;
              b.title = `${label} ${i + 1}`;
              b.setAttribute("aria-pressed", String(look[field] === i));
              b.addEventListener("click", () => {
                look = { ...look, [field]: i };
                refresh();
              });
              return b;
            }),
          );
        };
        rows.push(render);
        optionsBody.append(row);
      };

      colorRow("Pele", "skin", SKIN_COLORS);
      styleRow("Cabelo", "hair", HAIR_STYLES);
      colorRow("Cor", "hairColor", HAIR_COLORS);
      styleRow("Olhos", "eyes", EYE_STYLES);
      colorRow("Cor", "eyeColor", EYE_COLORS);
      styleRow("Roupa", "top", TOP_STYLES);
      colorRow("Cor", "topColor", CLOTH_COLORS);
      styleRow("Parte de baixo", "bottom", BOTTOM_STYLES);
      colorRow("Cor", "bottomColor", CLOTH_COLORS);
      colorRow("Sapatos", "shoesColor", CLOTH_COLORS);
      styleRow("Chapéu", "hat", HAT_STYLES);
      colorRow("Cor", "hatColor", CLOTH_COLORS);
      refresh();

      random.addEventListener("click", () => {
        look = randomLook();
        refresh();
      });
      next.addEventListener("click", () => {
        window.clearInterval(anim);
        showStep2();
      });

      const body = el("div", "creator-body");
      body.append(options, preview);
      shell.append(head, body);
    };

    // ============ Passo 2: criatura inicial ============
    const showStep2 = () => {
      shell.replaceChildren();
      const head = el("header", "creator-head");
      head.append(el("h1", "", "Wildora"), el("span", "step", "Passo 2 de 2 · Escolha sua primeira criatura"));

      const panel = el("section", "panel starters-panel");
      panel.append(el("h2", "", "Criaturas iniciais"));
      const grid = el("div", "panel-body starter-grid");

      const cards = STARTERS.map((id) => {
        const s = SPECIES[id];
        const types = s.types as TypeId[];
        const card = el("button", "starter-card");
        card.type = "button";
        card.style.setProperty("--type", TYPE_COLOR[types[0]]);
        card.setAttribute("aria-pressed", String(id === starter));
        const art = creatureArt(id, s.name, types);
        art.classList.add("starter-art");
        const tag = el("span", "type-tag", types.map((t) => TYPE_LABEL[t]).join("/"));
        card.append(el("strong", "starter-name", s.name), art, tag, el("p", "", STARTER_BLURB[id] ?? ""));
        card.addEventListener("click", () => {
          starter = id;
          for (const c of cards) c.setAttribute("aria-pressed", String(c === card));
        });
        return card;
      });
      grid.append(...cards);
      panel.append(grid);

      const footer = el("div", "step2-actions");
      const back = el("button", "btn ghost", "Voltar");
      back.type = "button";
      const trainer = avatarCanvas(look, "down", 4);
      trainer.className = "mini-trainer";
      const go = el("button", "btn primary", "Começar aventura");
      go.type = "button";
      const error = el("div", "creator-error");
      footer.append(back, trainer, go);

      back.addEventListener("click", showStep1);
      go.addEventListener("click", () => {
        const result: CreatorResult = { name: name.trim(), look: encodeLook(look), starter };
        save(result);
        go.disabled = true;
        go.textContent = "Entrando...";
        resolve(result);
      });

      shell.append(head, panel, footer, error);
    };

    showStep1();
  });
}

export function showCreatorError(root: HTMLElement, text: string) {
  const err = root.querySelector(".creator-error");
  if (err) err.textContent = text;
  const go = root.querySelector(".step2-actions .primary") as HTMLButtonElement | null;
  if (go) {
    go.disabled = false;
    go.textContent = "Começar aventura";
  }
}
