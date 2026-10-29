// Entre jogadores: menu ao tocar/clicar em alguém, pedidos recebidos e a tela de troca.
import type { Room } from "colyseus.js";
import { btn, closeModal, creatureRow, el, isModalOpen, openModal, showDialog } from "./panels";
import { uiState } from "../ui-state";
import { toast } from "../toast";
import {
  SOCIAL_REQUEST_MS,
  type SocialRequestMessage,
  type TradeEndMessage,
  type TradeStateMessage,
} from "../../../shared/constants";
import type { CreatureView } from "../../../shared/battle/engine";

/** Menu de um treinador: desafiar ou propor troca. */
export function openPlayerMenu(room: Room, sessionId: string, name: string) {
  if (uiState.inBattle) return;
  const body = el("div", "modal-body");
  body.append(el("p", "social-text", "Batalha amistosa: as criaturas lutam com Vida cheia e ninguém perde nada. Na troca, cada um escolhe uma criatura e os dois confirmam."));
  const actions = el("div", "social-actions");
  actions.append(
    btn("Desafiar para batalha", () => {
      room.send("social_request", { target: sessionId, kind: "battle" });
      closeModal();
    }),
    btn("Propor troca", () => {
      room.send("social_request", { target: sessionId, kind: "trade" });
      closeModal();
    }, "ghost"),
  );
  body.append(actions);
  openModal("player", `Treinador ${name}`, body);
}

/** Alguém pediu batalha ou troca: aceitar ou recusar (fechar = recusar). */
export function showSocialRequest(room: Room, msg: SocialRequestMessage) {
  if (uiState.inBattle) return room.send("social_answer", { from: msg.from, accept: false });
  let answered = false;
  const answer = (accept: boolean) => {
    if (answered) return;
    answered = true;
    room.send("social_answer", { from: msg.from, accept });
  };
  const body = el("div", "modal-body");
  body.append(
    el(
      "p",
      "social-text",
      msg.kind === "battle"
        ? `${msg.name} quer uma batalha amistosa com você. As criaturas lutam com Vida cheia e ninguém perde nada.`
        : `${msg.name} quer trocar criaturas com você. Cada um escolhe uma e os dois precisam confirmar.`,
    ),
  );
  const actions = el("div", "social-actions");
  actions.append(
    btn("Aceitar", () => {
      answer(true);
      closeModal();
    }),
    btn("Recusar", () => closeModal(), "ghost"),
  );
  body.append(actions);
  openModal("request", msg.kind === "battle" ? "Desafio!" : "Proposta de troca", body, { onClose: () => answer(false) });
  window.setTimeout(() => {
    if (!answered && isModalOpen("request")) closeModal();
  }, SOCIAL_REQUEST_MS - 1000);
}

// ---------------- Troca ----------------

let trade: TradeStateMessage | null = null;
let ending = false;
let render: (() => void) | null = null;

export function setupTrade(room: Room) {
  room.onMessage("trade_state", (msg: TradeStateMessage) => {
    trade = msg;
    if (!isModalOpen("trade")) openTrade(room);
    render?.();
  });
  room.onMessage("trade_end", (msg: TradeEndMessage) => {
    trade = null;
    if (isModalOpen("trade")) {
      ending = true;
      closeModal();
      ending = false;
    }
    if (msg.done) showDialog("Troca", msg.text);
    else toast(msg.text, 3000);
  });
}

function openTrade(room: Room) {
  const body = el("div", "modal-body trade");
  const { setRender } = openModal("trade", "Troca", body, {
    wide: true,
    onClose: () => {
      render = null;
      if (!ending) room.send("trade_cancel");
    },
  });
  let picking = true;

  render = () => {
    const t = trade;
    if (!t) return;
    const cols = el("div", "trade-cols");

    // --- minha oferta ---
    const mine = el("section", "trade-col");
    mine.append(el("h3", "", "Você oferece"));
    if (t.mine && !picking) {
      mine.append(creatureRow(t.mine, [btn("Trocar escolha", () => ((picking = true), render?.()), "ghost small")]));
    } else {
      const p = uiState.profile;
      const all: { c: CreatureView; where: string }[] = [
        ...(p?.team ?? []).map((c) => ({ c, where: "Time" })),
        ...(p?.box ?? []).map((c) => ({ c, where: "Caixa" })),
      ];
      mine.append(el("p", "hint", "Escolha uma criatura do time ou da caixa."));
      const list = el("div", "c-list trade-pick");
      for (const { c, where } of all) {
        const pick = btn(t.mine?.uid === c.uid ? "Escolhida" : "Oferecer", () => {
          picking = false;
          room.send("trade_offer", { uid: c.uid });
        }, "small");
        const row = creatureRow(c, [pick], true);
        row.querySelector(".c-top")?.append(el("span", "c-lvl", `· ${where}`));
        list.append(row);
      }
      mine.append(list);
    }

    // --- oferta do outro ---
    const theirs = el("section", "trade-col");
    theirs.append(el("h3", "", `${t.partner} oferece`));
    if (t.theirs) {
      theirs.append(creatureRow(t.theirs));
      if (t.theirsCaughtBy) theirs.append(el("p", "hint", `Capturado por ${t.theirsCaughtBy}.`));
    } else {
      theirs.append(el("p", "trade-wait", `Esperando ${t.partner} escolher...`));
    }
    cols.append(mine, theirs);

    // --- confirmação ---
    const status = el(
      "p",
      "trade-status",
      t.myOk
        ? `Você confirmou. Esperando ${t.partner}...`
        : t.theirOk
          ? `${t.partner} já confirmou. Confira e confirme também.`
          : t.mine && t.theirs
            ? "Os dois escolheram. Confirme para trocar."
            : "Cada um escolhe uma criatura.",
    );
    const actions = el("div", "social-actions");
    actions.append(
      btn(t.myOk ? "Confirmado" : "Confirmar troca", () => room.send("trade_confirm"), "", !t.mine || !t.theirs || t.myOk),
      btn("Cancelar", () => closeModal(), "ghost"),
    );
    body.replaceChildren(cols, status, actions);
  };
  setRender(() => render?.());
  render();
}
