// Casa do Treinador: troca os golpes das criaturas do time.
// Ensina os golpes do repertório da espécie (de graça) e golpes do tipo dela (pagando Sementes).
import type { Room } from "colyseus.js";
import { btn, creatureRow, el, openModal } from "./panels";
import { uiState } from "../ui-state";
import { getMove } from "../../../shared/battle/data";
import { TYPE_COLOR, TYPE_LABEL } from "../../../shared/battle/types";
import { MAX_MOVES } from "../../../shared/battle/engine";
import { tutorOptions, type TutorOption } from "../../../shared/tutor";

function moveChip(id: string) {
  const m = getMove(id);
  const chip = el("span", "c-move tutor-move", m.name);
  chip.style.borderColor = TYPE_COLOR[m.type];
  return chip;
}

function moveInfo(id: string) {
  const m = getMove(id);
  return `${TYPE_LABEL[m.type]} · ${m.power === null ? "muda estado" : `força ${m.power}`} · precisão ${m.accuracy}%`;
}

const priceLabel = (o: TutorOption) => (o.price ? `${o.price} Sementes` : "Grátis");

export function openTutor(room: Room) {
  const body = el("div", "modal-body tutor");
  let picked: string | null = null; // uid da criatura
  let learning: string | null = null; // golpe escolhido, esperando qual substituir
  let sending: string | null = null; // golpe enviado ao servidor, esperando o perfil voltar
  let sentMoves = "";

  const send = (index: number, moveId: string, replace: number, movesNow: string) => {
    room.send("tutor_teach", { index, moveId, replace });
    learning = null;
    sending = moveId;
    sentMoves = movesNow;
    render();
    // se o servidor recusar (aviso aparece na tela), libera os botões de novo
    setTimeout(() => {
      if (sending === moveId) {
        sending = null;
        render();
      }
    }, 1500);
  };

  const render = () => {
    const p = uiState.profile;
    if (!p) return;
    body.replaceChildren();
    const c = p.team.find((x) => x.uid === picked) ?? null;

    // ---------- escolher a criatura ----------
    if (!c) {
      body.append(
        el(
          "p",
          "social-text",
          "Aqui você troca os golpes das suas criaturas. Golpes do repertório da espécie são de graça (até os que ela esqueceu). Golpes do tipo dela custam Sementes.",
        ),
      );
      const list = el("div", "c-list");
      for (const x of p.team) {
        const now = tutorOptions(x.speciesId).filter((o) => o.level <= x.level && !x.moves.some((m) => m.id === o.moveId)).length;
        list.append(creatureRow(x, [btn(now ? `Trocar golpes (${now})` : "Ver golpes", () => ((picked = x.uid), (learning = null), render()), "small")], true));
      }
      body.append(list);
      return;
    }

    const index = p.team.findIndex((x) => x.uid === c.uid);
    const known = c.moves.map((m) => m.id);
    if (sending && known.join() !== sentMoves) sending = null; // perfil novo chegou: terminou
    const options = tutorOptions(c.speciesId).filter((o) => !known.includes(o.moveId));
    const now = options.filter((o) => o.level <= c.level);
    const later = options.filter((o) => o.level > c.level);

    body.append(creatureRow(c, [btn("Outra criatura", () => ((picked = null), (learning = null), render()), "ghost small")], true));
    body.append(el("p", "hint", `Você tem ${p.money} Sementes.`));

    // ---------- escolher qual golpe sai ----------
    if (learning) {
      const opt = now.find((o) => o.moveId === learning)!;
      const sec = el("div", "tutor-section");
      sec.append(el("h3", "", `${getMove(learning).name} entra no lugar de qual?`));
      const list = el("div", "tutor-list");
      c.moves.forEach((m, slot) => {
        const row = el("div", "tutor-row");
        row.append(moveChip(m.id), el("span", "tutor-info", moveInfo(m.id)), btn("Esquecer este", () => send(index, opt.moveId, slot, known.join()), "small"));
        list.append(row);
      });
      sec.append(list, btn("Cancelar", () => ((learning = null), render()), "ghost small"));
      body.append(sec);
      return;
    }

    // ---------- golpes atuais ----------
    const current = el("div", "tutor-section");
    current.append(el("h3", "", `Golpes atuais (${c.moves.length}/${MAX_MOVES})`));
    const cur = el("div", "tutor-list");
    for (const m of c.moves) {
      const row = el("div", "tutor-row");
      row.append(moveChip(m.id), el("span", "tutor-info", moveInfo(m.id)));
      cur.append(row);
    }
    current.append(cur);
    body.append(current);

    // ---------- pode aprender agora ----------
    const learn = el("div", "tutor-section");
    learn.append(el("h3", "", "Pode aprender agora"));
    if (!now.length) learn.append(el("p", "hint", "Nada novo por enquanto. Suba de nível para liberar mais golpes."));
    const list = el("div", "tutor-list");
    for (const o of now) {
      const row = el("div", `tutor-row${o.source === "tipo" ? " paid" : ""}`);
      const tooPoor = p.money < o.price;
      const label = sending === o.moveId ? "Ensinando..." : tooPoor ? "Sem Sementes" : "Aprender";
      row.append(
        moveChip(o.moveId),
        el("span", "tutor-info", moveInfo(o.moveId)),
        el("span", `tutor-price${o.price ? "" : " free"}`, priceLabel(o)),
        btn(
          label,
          () => {
            if (c.moves.length < MAX_MOVES) send(index, o.moveId, -1, known.join());
            else {
              learning = o.moveId;
              render();
            }
          },
          "small",
          tooPoor || sending !== null,
        ),
      );
      list.append(row);
    }
    learn.append(list);
    body.append(learn);

    // ---------- mais adiante ----------
    if (later.length) {
      const sec = el("div", "tutor-section");
      sec.append(el("h3", "", "Mais adiante"));
      const l = el("div", "tutor-list");
      for (const o of later) {
        const row = el("div", "tutor-row locked");
        row.append(moveChip(o.moveId), el("span", "tutor-info", `Nv. ${o.level} · ${priceLabel(o)}`));
        l.append(row);
      }
      sec.append(l);
      body.append(sec);
    }
  };

  const m = openModal("tutor", "Casa do Treinador", body, { wide: true });
  m.setRender(render);
  render();
}
