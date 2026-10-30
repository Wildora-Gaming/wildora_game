// Livro de Criaturas: todas as espécies em ordem de número.
// Capturadas aparecem em cores; vistas (enfrentou e não capturou), em cinza; não vistas, só a silhueta.
import { btn, el, openModal } from "./panels";
import { uiState } from "../ui-state";
import { creatureArt } from "../creature-art";
import { SPECIES } from "../../../shared/battle/data";
import { TYPE_COLOR, TYPE_LABEL } from "../../../shared/battle/types";
import { ZONES } from "../../../shared/creatures";
import { LEGENDARIES } from "../../../shared/battle/engine";
import { LEGEND_SPOTS } from "../../../shared/map";

type Filter = "all" | "caught" | "seen" | "unseen";
const ORDER = Object.keys(SPECIES);
const number = (id: string) => `#${String(ORDER.indexOf(id) + 1).padStart(3, "0")}`;
const fold = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Linha evolutiva completa (da forma inicial até a final). */
function chainOf(id: string): { id: string; level?: number }[] {
  let base = id;
  for (;;) {
    const prev = ORDER.find((k) => SPECIES[k].evolvesTo?.species === base);
    if (!prev) break;
    base = prev;
  }
  const chain: { id: string; level?: number }[] = [{ id: base }];
  for (let evo = SPECIES[base].evolvesTo; evo; evo = SPECIES[evo.species].evolvesTo) chain.push({ id: evo.species, level: evo.level });
  return chain;
}

/** Onde encontrar: regiões em que a linha aparece na grama alta. */
function habitat(id: string): string[] {
  if (LEGENDARIES.has(id)) return [`Evento lendário ${LEGEND_SPOTS[id]?.at ?? ""}, a cada 2 a 3 horas`];
  if (["leafin", "flambo", "aquari"].includes(id) || ["leafin", "flambo", "aquari"].includes(chainOf(id)[0].id)) {
    return ["Inicial: escolhida ao criar o personagem"];
  }
  const line = chainOf(id).map((c) => c.id);
  const out: string[] = [];
  for (const z of Object.values(ZONES)) {
    const e = z.table.filter((x) => line.includes(x.speciesId));
    if (!e.length) continue;
    const night = e.every((x) => x.nightOnly) ? " (à noite)" : "";
    out.push(`${z.name}${night}`);
  }
  if (!out.length) return ["Ainda não aparece na natureza"];
  if (line.indexOf(id) > 0) out.push("Mais longe da vila, já aparece evoluída");
  return out;
}

export function openBook() {
  const body = el("div", "modal-body book");
  let filter: Filter = "all";
  let query = "";
  let selected: string | null = null;

  const search = el("input", "box-search");
  search.type = "search";
  search.id = "book-search";
  search.placeholder = "Buscar por nome, número ou tipo";
  search.autocomplete = "off";
  search.addEventListener("input", () => {
    query = search.value;
    fill();
  });
  search.addEventListener("keydown", (e) => e.stopPropagation());
  const head = el("div", "book-head");
  const chips = el("div", "tabs small-tabs");
  const grid = el("div", "book-grid");
  const detail = el("div", "book-detail");

  const status = (id: string) => {
    const p = uiState.profile;
    if (p?.dexCaught.includes(id)) return "caught";
    if (p?.dexSeen.includes(id)) return "seen";
    return "unseen";
  };
  const owned = (id: string) => !!uiState.profile && [...uiState.profile.team, ...uiState.profile.box].some((c) => c.speciesId === id);

  const card = (id: string) => {
    const st = status(id);
    const sp = SPECIES[id];
    const c = el("button", `book-card ${st}${selected === id ? " on" : ""}`);
    c.type = "button";
    c.append(el("span", "book-num", number(id)), creatureArt(id, st === "unseen" ? "???" : sp.name, sp.types, { box: 56 }));
    c.append(el("span", "book-name", st === "unseen" ? "???" : sp.name));
    if (owned(id)) c.append(el("span", "book-own", "●"));
    c.title = st === "caught" ? `${sp.name}: capturada` : st === "seen" ? `${sp.name}: vista, ainda não capturada` : "Ainda não vista";
    c.addEventListener("click", () => {
      selected = selected === id ? null : id;
      fill();
    });
    return c;
  };

  const showDetail = () => {
    detail.replaceChildren();
    if (!selected) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    const id = selected;
    const st = status(id);
    const sp = SPECIES[id];
    const top = el("div", "book-detail-top");
    top.append(creatureArt(id, sp.name, sp.types, { box: 96 }));
    const info = el("div", "book-detail-info");
    info.append(el("strong", "", st === "unseen" ? `${number(id)} ???` : `${number(id)} ${sp.name}`));
    if (st !== "unseen") {
      const types = el("div", "book-types");
      for (const t of sp.types) {
        const chip = el("span", "c-type", TYPE_LABEL[t]);
        chip.style.background = TYPE_COLOR[t];
        types.append(chip);
      }
      info.append(types);
    }
    info.append(el("span", "hint", st === "caught" ? (owned(id) ? "Capturada · você tem uma" : "Capturada") : st === "seen" ? "Vista, ainda não capturada" : "Ainda não vista"));
    top.append(info);
    detail.append(top);
    // evolução
    const chain = chainOf(id);
    if (chain.length > 1) {
      const row = el("div", "book-chain");
      chain.forEach((step, i) => {
        if (i > 0) row.append(el("span", "book-arrow", `→ Nv. ${step.level}`));
        const known = status(step.id) !== "unseen";
        const mini = el("button", `book-mini ${status(step.id)}`);
        mini.type = "button";
        mini.append(creatureArt(step.id, known ? SPECIES[step.id].name : "???", SPECIES[step.id].types, { box: 40 }), el("span", "", known ? SPECIES[step.id].name : "???"));
        mini.addEventListener("click", () => {
          selected = step.id;
          fill();
        });
        row.append(mini);
      });
      detail.append(row);
    }
    // onde vive e atributos (só depois de ver)
    if (st !== "unseen") {
      detail.append(el("h3", "shop-sub", "Onde encontrar"));
      const ul = el("ul", "book-where");
      for (const h of habitat(id)) ul.append(el("li", "", h));
      detail.append(ul);
    }
    if (st === "caught") {
      const stats = el("div", "book-stats");
      const b = sp.base;
      for (const [label, v] of [["Vida", b.hp], ["Ataque", b.atk], ["Defesa", b.def], ["Velocidade", b.spe]] as const) {
        const row = el("div", "book-stat");
        const bar = el("span", "book-bar");
        const fillBar = el("i");
        fillBar.style.width = `${Math.min(100, (v / 120) * 100)}%`;
        bar.append(fillBar);
        row.append(el("span", "", label), bar, el("span", "book-val", String(v)));
        stats.append(row);
      }
      detail.append(el("h3", "shop-sub", "Atributos base"), stats);
    } else if (st === "seen") {
      detail.append(el("p", "hint", "Capture para ver os atributos."));
    }
  };

  const fill = () => {
    const p = uiState.profile;
    const caught = p?.dexCaught.length ?? 0;
    const seen = new Set([...(p?.dexSeen ?? []), ...(p?.dexCaught ?? [])]).size;
    head.textContent = `Capturadas ${caught} · Vistas ${seen} · Total ${ORDER.length}`;
    chips.replaceChildren();
    for (const [k, label] of [["all", "Todas"], ["caught", "Capturadas"], ["seen", "Só vistas"], ["unseen", "Não vistas"]] as const)
      chips.append(btn(label, () => ((filter = k), fill()), filter === k ? "tab active small" : "tab small"));
    const q = fold(query.trim());
    grid.replaceChildren();
    for (const id of ORDER) {
      const st = status(id);
      if (filter !== "all" && st !== filter) continue;
      if (q) {
        const sp = SPECIES[id];
        const hay = st === "unseen" ? number(id) : `${number(id)} ${fold(sp.name)} ${sp.types.map((t) => fold(TYPE_LABEL[t])).join(" ")}`;
        if (!hay.includes(q)) continue;
      }
      grid.append(card(id));
    }
    if (!grid.childElementCount) grid.append(el("p", "empty", "Nenhuma criatura aqui."));
    showDetail();
  };

  const controls = el("div", "box-controls");
  controls.append(search);
  body.append(head, controls, chips, detail, grid);
  const m = openModal("book", "Livro de Criaturas", body, { wide: true });
  m.setRender(fill);
  fill();
}
