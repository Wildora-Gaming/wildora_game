// Casa do Treinador: troca os golpes das criaturas do time por outros que elas já podem saber.
import type { Room } from "colyseus.js";
import { btn, creatureRow, el, openModal } from "./panels";
import { uiState } from "../ui-state";
import { SPECIES, getMove } from "../../../shared/battle/data";
import { TYPE_COLOR, TYPE_LABEL } from "../../../shared/battle/types";
import { MAX_MOVES } from "../../../shared/battle/engine";

function moveChip(id: string, extra = "") {
  const m = getMove(id);
  const chip = el("span", "c-move tutor-move", `${m.name}${extra}`);
  chip.style.borderColor = TYPE_COLOR[m.type];
  chip.title = `${TYPE_LABEL[m.type]} · ${m.power ?? "estado"} · ${m.accuracy}%`;
  return chip;
}

function moveInfo(id: string) {
  const m = getMove(id);
  return `${TYPE_LABEL[m.type]} · ${m.power === null ? "estado" : `força ${m.power}`} · ${m.accuracy}%`;
}

export function openTutor(room: Room) {
  const body = el("div", "modal-body tutor");
  let picked: string | null = null; // uid da criatura
  let learning: string | null = null; // golpe escolhido para aprender

  const render = () => {
    const p = uiState.profile;
    if (!p) return;
    body.replaceChildren();
    const c = p.team.find((x) => x.uid === picked) ?? null;

    if (!c) {
      body.append(el("p", "social-text", "Aqui suas criaturas trocam de golpe por outro que já sabem pelo nível. É de graça. Escolha uma criatura do time."));
      const list = el("div", "c-list");
      for (const x of p.team) {
        const ls = SPECIES[x.speciesId].learnset;
        const known = ls.filter(([lvl, id]) => lvl <= x.level && !x.moves.some((m) => m.id === id)).length;
        const next = ls.find(([lvl]) => lvl > x.level);
        const label = known ? `Trocar golpes (${known})` : next ? `${getMove(next[1]).name} no Nv. ${next[0]}` : "Nada novo";
        list.append(creatureRow(x, [btn(label, () => ((picked = x.uid), (learning = null), render()), "small", !known)], true));
      }
      body.append(list);
      return;
    }

    const index = p.team.findIndex((x) => x.uid === c.uid);
    const learnset = SPECIES[c.speciesId].learnset;
    const available = learnset.filter(([lvl, id]) => lvl <= c.level && !c.moves.some((m) => m.id === id)).map(([, id]) => id);
    const later = learnset.filter(([lvl]) => lvl > c.level);

    body.append(creatureRow(c, [btn("Outra criatura", () => ((picked = null), render()), "ghost small")], true));

    // golpes atuais
    const current = el("div", "tutor-section");
    current.append(el("h3", "", "Golpes atuais"));
    const cur = el("div", "tutor-list");
    c.moves.forEach((m, slot) => {
      const row = el("div", "tutor-row");
      row.append(moveChip(m.id), el("span", "tutor-info", moveInfo(m.id)));
      if (learning) {
        row.append(
          btn(`Trocar por ${getMove(learning).name}`, () => {
            room.send("tutor_teach", { index, moveId: learning, replace: slot });
            learning = null;
          }, "small"),
        );
      }
      cur.append(row);
    });
    if (learning && c.moves.length < MAX_MOVES) {
      const row = el("div", "tutor-row");
      row.append(el("span", "tutor-info", `Vaga livre (${c.moves.length}/${MAX_MOVES})`));
      row.append(
        btn(`Aprender ${getMove(learning).name}`, () => {
          room.send("tutor_teach", { index, moveId: learning, replace: -1 });
          learning = null;
        }, "small"),
      );
      cur.append(row);
    }
    current.append(cur);

    // golpes para aprender
    const learn = el("div", "tutor-section");
    learn.append(el("h3", "", "Pode aprender"));
    if (!available.length) learn.append(el("p", "hint", "Nenhum golpe novo por enquanto. Suba de nível para liberar mais."));
    const list = el("div", "tutor-list");
    for (const id of available) {
      const row = el("div", `tutor-row${learning === id ? " on" : ""}`);
      row.append(moveChip(id), el("span", "tutor-info", moveInfo(id)));
      row.append(
        btn(learning === id ? "Cancelar" : "Escolher", () => {
          learning = learning === id ? null : id;
          render();
        }, learning === id ? "ghost small" : "small"),
      );
      list.append(row);
    }
    learn.append(list);
    if (learning) learn.append(el("p", "hint", `Agora escolha qual golpe atual ${getMove(learning).name} vai substituir.`));

    body.append(learning ? learn : current, learning ? current : learn);

    if (later.length) {
      body.append(el("p", "hint", `Próximos: ${later.map(([lvl, id]) => `${getMove(id).name} (Nv. ${lvl})`).join(", ")}.`));
    }
  };

  const m = openModal("tutor", "Casa do Treinador", body, { wide: true });
  m.setRender(render);
  render();
}
