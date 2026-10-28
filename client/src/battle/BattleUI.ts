// Tela de batalha em HTML por cima do mundo.
// Só desenha e anima: todas as regras são resolvidas no servidor.
import type { Room } from "colyseus.js";
import "./battle.css";
import { creatureArt } from "../creature-art";
import { uiState } from "../ui-state";
import { STATUS_LABEL } from "../../../shared/battle/data";
import { TYPE_COLOR, TYPE_LABEL } from "../../../shared/battle/types";
import { describeEvent, type BattleNames } from "../../../shared/battle/text";
import type { BattleEvent, CreatureView, Side } from "../../../shared/battle/engine";
import type { BattleStartMessage, BattleTurnMessage } from "../../../shared/constants";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TEXT_MS = 1100;

interface SideView {
  fighter: HTMLElement;
  name: HTMLElement;
  level: HTMLElement;
  status: HTMLElement;
  hpFill: HTMLElement;
  hpNumbers?: HTMLElement;
  xpFill?: HTMLElement;
}

export class BattleUI {
  private root: HTMLElement;
  private field!: HTMLElement;
  private message!: HTMLElement;
  private actions!: HTMLElement;
  private sides!: Record<Side, SideView>;
  private player!: CreatureView;
  private foe!: CreatureView;
  private wild = true;
  private queue: Promise<void> = Promise.resolve();

  constructor(private room: Room) {
    this.root = document.createElement("div");
    this.root.id = "battle";
    this.root.hidden = true;
    document.body.append(this.root);

    room.onMessage("battle_start", (msg: BattleStartMessage) => this.enqueue(() => this.open(msg)));
    room.onMessage("battle_turn", (msg: BattleTurnMessage) => this.enqueue(() => this.playTurn(msg)));

    window.addEventListener("keydown", (e) => {
      if (this.root.hidden) return;
      const inMoves = this.actions?.classList.contains("moves") && this.actions.getAttribute("aria-busy") !== "true";
      if (e.key === "Escape" && inMoves) this.showMainMenu();
    });
  }

  private enqueue(job: () => Promise<void>) {
    this.queue = this.queue.then(job).catch((err) => console.error(err));
  }

  private get names(): BattleNames {
    return { player: this.player.name, foe: this.foe.name };
  }

  // ---------- Montagem ----------

  private async open(msg: BattleStartMessage) {
    uiState.inBattle = true;
    (document.activeElement as HTMLElement | null)?.blur();
    this.player = msg.player;
    this.foe = msg.foe;
    this.wild = msg.wild;

    this.root.replaceChildren();
    const frame = el("div", "battle-frame");
    this.field = el("div", "battle-field");
    this.field.append(el("div", "platform foe"), el("div", "platform player"));

    const foeSide = this.buildSide("foe", msg.foe);
    const playerSide = this.buildSide("player", msg.player);
    this.sides = { foe: foeSide, player: playerSide };
    this.renderSide("foe", msg.foe);
    this.renderSide("player", msg.player);

    const panel = el("div", "battle-panel");
    this.message = el("div", "battle-message");
    this.actions = el("div", "battle-actions");
    panel.append(this.message, this.actions);
    frame.append(this.field, panel);
    this.root.append(frame);
    this.root.hidden = false;

    this.setBusy(true);
    await this.say(`Um ${msg.foe.name} selvagem apareceu!`);
    await this.say(`Vai, ${msg.player.name}!`, 800);
    this.showMainMenu();
  }

  private buildSide(side: Side, c: CreatureView): SideView {
    const fighter = el("div", `fighter ${side}`);
    fighter.append(creatureArt(c.speciesId, c.name, c.types, side === "player" ? "back" : "front"));

    const info = el("div", `info ${side}`);
    const head = el("div", "info-head");
    const nameWrap = el("div");
    const name = el("span", "info-name", c.name);
    const status = el("span", "status-badge");
    nameWrap.append(name, status);
    const level = el("span", "info-level", `Nv. ${c.level}`);
    head.append(nameWrap, level);

    const hpRow = el("div", "hp-row");
    const track = el("div", "hp-track");
    const hpFill = el("div", "hp-fill");
    track.append(hpFill);
    hpRow.append(el("span", "hp-label", "HP"), track);
    info.append(head, hpRow);

    const view: SideView = { fighter, name, level, status, hpFill };
    if (side === "player") {
      view.hpNumbers = el("div", "hp-numbers");
      const xpTrack = el("div", "xp-track");
      view.xpFill = el("div", "xp-fill");
      xpTrack.append(view.xpFill);
      info.append(view.hpNumbers, xpTrack);
    }
    this.field.append(fighter, info);
    return view;
  }

  private renderSide(side: Side, c: CreatureView) {
    const v = this.sides?.[side];
    if (!v) return;
    v.level.textContent = `Nv. ${c.level}`;
    this.setHp(side, c.hp, c.maxHp);
    this.setStatus(side, c.status);
    if (v.xpFill) v.xpFill.style.width = `${Math.round(c.xpProgress * 100)}%`;
  }

  private setHp(side: Side, hp: number, maxHp: number) {
    const v = this.sides[side];
    const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
    v.hpFill.style.width = `${pct}%`;
    v.hpFill.classList.toggle("mid", pct <= 50 && pct > 20);
    v.hpFill.classList.toggle("low", pct <= 20);
    if (v.hpNumbers) v.hpNumbers.textContent = `${hp}/${maxHp}`;
  }

  private setStatus(side: Side, status: string | null) {
    const badge = this.sides[side].status;
    badge.hidden = !status;
    badge.dataset.s = status ?? "";
    badge.textContent = status ? STATUS_LABEL[status as keyof typeof STATUS_LABEL] : "";
  }

  // ---------- Menus ----------

  private setBusy(busy: boolean) {
    this.actions.setAttribute("aria-busy", String(busy));
  }

  private showMainMenu() {
    this.message.textContent = `O que ${this.player.name} vai fazer?`;
    this.actions.className = "battle-actions";
    this.actions.replaceChildren(
      button("Lutar", "fight", () => this.showMoves()),
      button("Mochila", "bag", () => {}, true, "A mochila chega junto com a captura (fase 3)"),
      button("Criatura", "team", () => {}, true, "Trocar de criatura chega com o time completo (fase 3)"),
      button("Fugir", "run", () => this.act({ kind: "run" }), !this.wild),
    );
    this.setBusy(false);
  }

  private showMoves() {
    this.message.textContent = "Escolha um golpe.";
    this.actions.className = "battle-actions moves";
    const buttons = this.player.moves.map((m, i) => {
      const b = button(m.name, "move", () => this.act({ kind: "move", moveIndex: i }));
      b.style.background = TYPE_COLOR[m.type];
      const info = document.createElement("small");
      info.textContent = `${TYPE_LABEL[m.type]} · ${m.power ?? "estado"} · ${m.accuracy}%`;
      b.append(info);
      return b;
    });
    this.actions.replaceChildren(...buttons, button("Voltar", "back", () => this.showMainMenu()));
  }

  private act(action: { kind: "move"; moveIndex: number } | { kind: "run" }) {
    this.setBusy(true);
    this.message.textContent = "...";
    this.room.send("battle_action", action);
  }

  // ---------- Reprodução de turno ----------

  private async playTurn(msg: BattleTurnMessage) {
    for (const e of msg.events) await this.playEvent(e);

    this.player = msg.player;
    this.foe = msg.foe;
    this.renderSide("player", msg.player);
    this.renderSide("foe", msg.foe);

    if (msg.over) {
      await sleep(500);
      this.close();
    } else {
      this.showMainMenu();
    }
  }

  private async playEvent(e: BattleEvent) {
    const text = describeEvent(e, this.names, this.wild);
    switch (e.t) {
      case "damage":
      case "tick": {
        const target = this.sides[e.side].fighter;
        target.classList.remove("hit");
        void target.offsetWidth; // reinicia a animação
        target.classList.add("hit");
        this.setHp(e.side, e.hp, e.maxHp);
        if (text) await this.say(text);
        else await sleep(650);
        return;
      }
      case "faint":
        this.sides[e.side].fighter.classList.add("fainted");
        break;
      case "status":
        this.setStatus(e.side, e.status);
        break;
      case "wake":
      case "calm":
        this.setStatus(e.side, null);
        break;
      case "level":
        this.sides.player.level.textContent = `Nv. ${e.level}`;
        break;
    }
    if (text) await this.say(text);
  }

  private async say(text: string, ms = TEXT_MS) {
    this.message.textContent = text;
    await sleep(ms);
  }

  private close() {
    this.root.hidden = true;
    this.root.replaceChildren();
    uiState.inBattle = false;
  }
}

function el(tag: string, className = "", text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, kind: string, onClick: () => void, disabled = false, title?: string) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `battle-btn ${kind}`;
  b.textContent = label;
  b.disabled = disabled;
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}
