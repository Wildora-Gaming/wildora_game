// Tela de batalha em HTML por cima do mundo.
// Só desenha e anima: todas as regras são resolvidas no servidor.
import type { Room } from "colyseus.js";
import "./battle.css";
import { sound } from "../audio/audio";
import { creatureArt } from "../creature-art";
import { itemIcon } from "../items-art";
import { uiState } from "../ui-state";
import { STATUS_LABEL } from "../../../shared/battle/data";
import { TYPE_COLOR, TYPE_LABEL } from "../../../shared/battle/types";
import { describeEvent, type BattleNames } from "../../../shared/battle/text";
import { getItem } from "../../../shared/items";
import type { Action, BattleEvent, CreatureView, Side } from "../../../shared/battle/engine";
import type { BattleStartMessage, BattleTurnMessage } from "../../../shared/constants";
import { AVATAR_H, AVATAR_W } from "../../../shared/avatar/compose";
import { parseLook } from "../../../shared/avatar/look";
import { drawAvatar } from "../avatar/sheet";

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
  private team: CreatureView[] = [];
  private active = 0;
  private foe!: CreatureView;
  private bag: Record<string, number> = {};
  private wild = true;
  /** batalha amistosa contra outro jogador */
  private pvp = false;
  private trainer: BattleStartMessage["trainer"];
  private foeCount = 1;
  private foeLeft = 1;
  private foeBalls!: HTMLElement;
  private needSwitch = false;
  private orb: HTMLElement | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private room: Room) {
    this.root = document.createElement("div");
    this.root.id = "battle";
    this.root.hidden = true;
    document.body.append(this.root);

    room.onMessage("battle_start", (msg: BattleStartMessage) => this.enqueue(() => this.open(msg)));
    room.onMessage("battle_turn", (msg: BattleTurnMessage) => this.enqueue(() => this.playTurn(msg)));

    window.addEventListener("keydown", (e) => {
      if (this.root.hidden || this.busy) return;
      if (e.key === "Escape" && !this.needSwitch && !this.actions.classList.contains("main")) this.showMainMenu();
    });
  }

  private get busy() {
    return this.actions?.getAttribute("aria-busy") === "true";
  }

  private get player() {
    return this.team[this.active];
  }

  private enqueue(job: () => Promise<void>) {
    this.queue = this.queue.then(job).catch((err) => console.error(err));
  }

  private get names(): BattleNames {
    return { player: this.player?.name ?? "", foe: this.foe?.name ?? "", trainer: this.trainer?.name, pvp: this.pvp };
  }

  // ---------- Montagem ----------

  private async open(msg: BattleStartMessage) {
    uiState.inBattle = true;
    (document.activeElement as HTMLElement | null)?.blur();
    this.team = msg.team;
    this.active = msg.active;
    this.foe = msg.foe;
    this.wild = msg.wild;
    this.pvp = Boolean(msg.pvp);
    this.trainer = msg.trainer;
    this.foeCount = msg.foeCount ?? 1;
    this.foeLeft = this.foeCount;
    this.needSwitch = false;
    this.bag = uiState.profile?.bag ?? {};

    this.root.replaceChildren();
    const frame = el("div", "battle-frame");
    this.field = el("div", "battle-field");
    this.field.append(el("div", "platform foe"), el("div", "platform player"));
    this.sides = { foe: this.buildSide("foe", msg.foe), player: this.buildSide("player", this.player) };
    this.renderSide("foe", msg.foe);
    this.renderSide("player", this.player);
    const zone = el("div", "zone-tag", msg.zone);
    this.foeBalls = el("div", "foe-balls");
    this.field.append(zone, this.foeBalls);
    this.renderFoeBalls();
    if (this.trainer) {
      const portrait = el("div", "trainer-portrait");
      const c = document.createElement("canvas");
      c.width = AVATAR_W * 4;
      c.height = AVATAR_H * 4;
      drawAvatar(c.getContext("2d")!, parseLook(this.trainer.look), "down", "stand", 0, 0, 4);
      portrait.append(c, el("span", "", `${this.trainer.title} ${this.trainer.name}`));
      this.field.append(portrait);
    }

    const panel = el("div", "battle-panel");
    this.message = el("div", "battle-message");
    this.actions = el("div", "battle-actions");
    panel.append(this.message, this.actions);
    frame.append(this.field, panel);
    this.root.append(frame);
    this.root.hidden = false;
    sound.battleStart(this.wild ? "wild" : "trainer");

    this.setBusy(true);
    if (this.pvp && this.trainer) {
      await this.say(`Batalha amistosa contra ${this.trainer.name}!`);
      await this.say(`${this.trainer.name} mandou ${msg.foe.name}!`, 900);
    } else if (this.trainer) {
      await this.say(`${this.trainer.title} ${this.trainer.name} quer batalhar!`);
      await this.say(`${this.trainer.name} mandou ${msg.foe.name}!`, 900);
    } else {
      await this.say(`Um ${msg.foe.name} selvagem apareceu!`);
    }
    await this.say(`Vai, ${this.player.name}!`, 800);
    this.showMainMenu();
  }

  private buildSide(side: Side, c: CreatureView): SideView {
    const fighter = el("div", `fighter ${side}`);
    fighter.append(creatureArt(c.speciesId, c.name, c.types, { scale: battleScale(side), mirror: side === "player" }));

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

  private renderFoeBalls() {
    if (!this.foeBalls) return;
    this.foeBalls.hidden = this.wild;
    this.foeBalls.replaceChildren(
      ...Array.from({ length: this.foeCount }, (_, i) => el("span", i < this.foeLeft ? "ball" : "ball out")),
    );
  }

  /** Troca a criatura inimiga em campo (treinador mandou a próxima). */
  private replaceFoe(c: CreatureView) {
    const old = this.sides.foe;
    old.fighter.remove();
    old.name.closest(".info")?.remove();
    this.sides.foe = this.buildSide("foe", c);
    this.renderSide("foe", c);
  }

  /** Troca a criatura do jogador em campo (arte e caixa de informação). */
  private replacePlayer(c: CreatureView) {
    const old = this.sides.player;
    old.fighter.remove();
    old.name.closest(".info")?.remove();
    this.sides.player = this.buildSide("player", c);
    this.renderSide("player", c);
  }

  private renderSide(side: Side, c: CreatureView) {
    const v = this.sides?.[side];
    if (!v) return;
    v.name.textContent = c.name;
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
    this.actions.className = "battle-actions main";
    const usable = !this.pvp && Object.entries(this.bag).some(([id, n]) => n > 0 && getItem(id) && getItem(id)!.kind !== "level");
    const canSwitch = this.team.some((c, i) => i !== this.active && c.hp > 0);
    this.actions.replaceChildren(
      button("Lutar", "fight", () => this.showMoves()),
      button("Mochila", "bag", () => this.showBag(), !usable),
      button("Criatura", "team", () => this.showTeam(false), !canSwitch),
      this.pvp
        ? button("Desistir", "run", () => this.confirmForfeit())
        : button("Fugir", "run", () => this.act({ kind: "run" }), !this.wild),
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

  private showBag() {
    this.message.textContent = "Usar qual item?";
    this.actions.className = "battle-actions list";
    const entries = Object.entries(this.bag).filter(([id, n]) => n > 0 && getItem(id) && getItem(id)!.kind !== "level");
    const buttons = entries.map(([id, n]) => {
      const item = getItem(id)!;
      const isOrb = item.kind === "orb";
      const full = !isOrb && this.player.hp >= this.player.maxHp;
      const b = button(`${item.name} ×${n}`, "item", () => this.act({ kind: "item", itemId: id }), (isOrb && !this.wild) || full);
      b.prepend(itemIcon(id, 22));
      b.title = item.description;
      return b;
    });
    this.actions.replaceChildren(...buttons, button("Voltar", "back", () => this.showMainMenu()));
  }

  private showTeam(forced: boolean) {
    this.message.textContent = forced ? "Escolha a próxima criatura." : "Trocar por qual criatura?";
    this.actions.className = "battle-actions list";
    const buttons = this.team.map((c, i) => {
      const b = button(`${c.name} Nv.${c.level} · ${c.hp}/${c.maxHp}`, "member", () => this.act({ kind: "switch", index: i }), c.hp <= 0 || i === this.active);
      return b;
    });
    if (!forced) buttons.push(button("Voltar", "back", () => this.showMainMenu()));
    this.actions.replaceChildren(...buttons);
    this.setBusy(false);
  }

  private confirmForfeit() {
    this.message.textContent = `Desistir da batalha contra ${this.trainer?.name ?? "o adversário"}?`;
    this.actions.className = "battle-actions main";
    this.actions.replaceChildren(
      button("Desistir", "fight", () => this.act({ kind: "run" })),
      button("Voltar", "back", () => this.showMainMenu()),
    );
  }

  private act(action: Action) {
    this.setBusy(true);
    this.message.textContent = this.pvp ? `Esperando ${this.trainer?.name ?? "o adversário"} escolher...` : "...";
    this.room.send("battle_action", action);
  }

  // ---------- Reprodução de turno ----------

  private async playTurn(msg: BattleTurnMessage) {
    for (const e of msg.events) await this.playEvent(e);

    this.team = msg.team;
    this.foe = msg.foe;
    this.bag = msg.bag;
    this.needSwitch = msg.needSwitch;
    if (msg.active !== this.active) {
      this.active = msg.active;
      this.replacePlayer(this.player);
    }
    this.renderSide("player", this.player);
    this.renderSide("foe", msg.foe);

    if (msg.over) {
      await sleep(500);
      this.close();
    } else if (msg.waiting) {
      this.message.textContent = msg.waiting;
      this.setBusy(true);
    } else if (msg.needSwitch) {
      this.showTeam(true);
    } else {
      this.showMainMenu();
    }
  }

  private async playEvent(e: BattleEvent) {
    const text = describeEvent(e, this.names, this.wild);
    this.eventSound(e);
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
        if (e.side === "foe" && !this.wild) {
          this.foeLeft = Math.max(0, this.foeLeft - 1);
          this.renderFoeBalls();
        }
        break;
      case "foe_switch":
        this.foe = e.view;
        this.foeLeft = e.left;
        this.renderFoeBalls();
        this.replaceFoe(e.view);
        break;
      case "status":
        this.setStatus(e.side, e.status);
        break;
      case "wake":
      case "calm":
        this.setStatus(e.side, null);
        break;
      case "switch":
        this.active = e.index;
        this.team[e.index] = e.view;
        this.replacePlayer(e.view);
        break;
      case "heal":
        if (e.index === this.active) this.setHp("player", e.hp, e.maxHp);
        break;
      case "throw": {
        this.orb?.remove();
        this.orb = el("div", "thrown-orb");
        this.orb.append(itemIcon(e.itemId, 40));
        this.field.append(this.orb);
        await this.say(text ?? "", 700);
        this.sides.foe.fighter.classList.add("absorbed");
        await sleep(400);
        return;
      }
      case "shake":
        for (let i = 0; i < e.count; i++) {
          this.orb?.classList.remove("wobble");
          void this.orb?.offsetWidth;
          this.orb?.classList.add("wobble");
          this.message.textContent = "...".repeat(i + 1);
          await sleep(650);
        }
        return;
      case "escape":
        this.orb?.remove();
        this.orb = null;
        this.sides.foe.fighter.classList.remove("absorbed");
        break;
      case "caught":
        this.orb?.classList.add("caught");
        break;
      case "level":
        if (e.name === this.player.name) this.sides.player.level.textContent = `Nv. ${e.level}`;
        break;
    }
    if (text) await this.say(text);
  }

  private eventSound(e: BattleEvent) {
    switch (e.t) {
      case "damage":
        sound.sfx(e.eff > 1 || e.crit ? "super" : e.eff < 1 ? "weak" : "hit");
        break;
      case "tick":
        sound.sfx("weak");
        break;
      case "miss":
        sound.sfx("miss");
        break;
      case "status":
        sound.sfx("status");
        break;
      case "faint":
        sound.sfx("faint");
        break;
      case "switch":
      case "foe_switch":
        sound.sfx("switch");
        break;
      case "throw":
        sound.sfx("throw");
        break;
      case "shake":
        if (e.count > 0) sound.sfx("shake");
        break;
      case "escape":
        sound.sfx("escape");
        break;
      case "run":
        if (e.ok) sound.sfx("run");
        break;
      case "caught":
        sound.jingle("caught");
        break;
      case "found":
        sound.sfx("buy");
        break;
      case "level":
        sound.jingle("level");
        break;
      case "evolve":
        sound.jingle("evolve");
        break;
      case "end":
        if (e.result === "win") sound.jingle("victory");
        break;
    }
  }

  private async say(text: string, ms = TEXT_MS) {
    this.message.textContent = text;
    await sleep(ms);
  }

  private close() {
    sound.battleEnd();
    this.root.hidden = true;
    this.root.replaceChildren();
    this.orb = null;
    uiState.inBattle = false;
  }
}

/** Escala inteira das criaturas na batalha, a partir da largura da janela. */
function battleScale(side: Side) {
  const frame = Math.min(960, window.innerWidth - 24);
  const base = Math.max(2, Math.min(5, Math.floor(frame / 240)));
  return side === "player" && frame >= 600 ? base + 1 : base;
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
