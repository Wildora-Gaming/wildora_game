import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import { MOVE_COOLDOWN_MS, TILE_SIZE, type ChatBroadcast, type Direction } from "../../../shared/constants";
import { MAP_HEIGHT, MAP_OBJECTS, MAP_WIDTH, Tile, tileAt } from "../../../shared/map";
import { inputBlocked, uiState } from "../ui-state";
import { openBagPanel, openTeamPanel } from "../panels/panels";
import { areaName } from "../../../shared/creatures";
import { grassOverlay, objectArt, objectKey, renderGround } from "../world/art";
import { ensureAvatar, frameIndex } from "../avatar/sheet";
import { toast } from "../toast";

/** Zoom da câmera: cada pixel da arte vira um bloco de N pixels na tela. */
export const WORLD_ZOOM = 3;

interface PlayerView {
  body: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  battleIcon: Phaser.GameObjects.Container;
  /** moitas na frente das pernas quando está na grama alta */
  grass: Phaser.GameObjects.Image;
  textureKey: string;
  dir: Direction;
  lastMoveAt: number;
  walking: boolean;
}

export class WorldScene extends Phaser.Scene {
  private views = new Map<string, PlayerView>();
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private lastMoveSent = 0;
  private area = "";

  constructor(private room: Room) {
    super("world");
  }

  create() {
    this.drawWorld();
    this.setupInput();
    this.bindRoom();
    this.setupChat();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    cam.setZoom(WORLD_ZOOM);
    cam.setRoundPixels(true);
    cam.setBackgroundColor("#2f6b35");
  }

  update(time: number) {
    for (const v of this.views.values()) {
      v.body.setDepth(v.body.y);
      if (v.walking && time - v.lastMoveAt > MOVE_COOLDOWN_MS + 70) {
        v.walking = false;
        v.sprite.stop();
        v.sprite.setFrame(frameIndex(v.dir, "stand"));
      }
    }

    if (inputBlocked()) return;
    const dir = this.heldDirection();
    if (dir && time - this.lastMoveSent >= MOVE_COOLDOWN_MS) {
      this.lastMoveSent = time;
      this.room.send("move", { dir });
    }
  }

  // ---------- Mundo ----------

  private drawWorld() {
    this.textures.addCanvas("ground", renderGround());
    this.add.image(0, 0, "ground").setOrigin(0).setDepth(-100000);

    for (const o of MAP_OBJECTS) {
      const key = objectKey(o);
      if (!this.textures.exists(key)) this.textures.addCanvas(key, objectArt(o));
      const x = o.x * TILE_SIZE + (o.w * TILE_SIZE) / 2;
      const y = (o.y + o.h) * TILE_SIZE;
      this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
    }
  }

  // ---------- Rede ----------

  private bindRoom() {
    const $ = getStateCallbacks(this.room);
    const online = document.getElementById("hud-online");

    $(this.room.state).players.onAdd((player: any, sessionId: string) => {
      const view = this.createPlayerView(player, sessionId === this.room.sessionId);
      this.views.set(sessionId, view);
      if (online) online.textContent = String(this.room.state.players.size);

      const isMe = sessionId === this.room.sessionId;
      $(player).onChange(() => this.syncPlayer(view, player, isMe));
      if (isMe) this.updateArea(player.x, player.y);
    });

    $(this.room.state).players.onRemove((_player: any, sessionId: string) => {
      this.views.get(sessionId)?.body.destroy();
      this.views.delete(sessionId);
      if (online) online.textContent = String(this.room.state.players.size);
    });

    this.room.onLeave(() => toast("Conexão perdida. Recarregue a página.", 0));

    // Dia e noite
    const night = document.getElementById("night");
    const clock = document.getElementById("hud-clock");
    $(this.room.state).listen("night", (isNight: boolean) => {
      night?.classList.toggle("on", isNight);
      if (clock) clock.textContent = isNight ? "· Noite" : "· Dia";
    });
  }

  private syncPlayer(view: PlayerView, player: any, isMe = false) {
    view.battleIcon.setVisible(Boolean(player.inBattle));
    view.grass.setVisible(tileAt(player.x, player.y) === Tile.TallGrass);
    if (isMe) this.updateArea(player.x, player.y);

    if (player.look) {
      const key = ensureAvatar(this, player.look);
      if (key !== view.textureKey) {
        view.textureKey = key;
        view.sprite.setTexture(key, frameIndex(view.dir, "stand"));
      }
    }

    const dir = (player.dir as Direction) ?? "down";
    const tx = player.x * TILE_SIZE + TILE_SIZE / 2;
    const ty = (player.y + 1) * TILE_SIZE;
    const dist = Math.abs(tx - view.body.x) + Math.abs(ty - view.body.y);

    if (dist === 0) {
      // só virou de lado (ou bateu num obstáculo)
      if (dir !== view.dir) {
        view.dir = dir;
        if (!view.walking) view.sprite.setFrame(frameIndex(dir, "stand"));
      }
      return;
    }

    view.dir = dir;
    this.tweens.killTweensOf(view.body);
    if (dist > TILE_SIZE * 1.5) {
      view.body.setPosition(tx, ty); // teleporte (ex.: voltou à vila após derrota)
      view.sprite.setFrame(frameIndex(dir, "stand"));
      return;
    }
    this.tweens.add({ targets: view.body, x: tx, y: ty, duration: MOVE_COOLDOWN_MS, ease: "Linear" });
    view.lastMoveAt = this.time.now;
    const anim = `${view.textureKey}:walk-${dir}`;
    if (!view.walking || view.sprite.anims.currentAnim?.key !== anim) view.sprite.play(anim, true);
    view.walking = true;
  }

  private updateArea(x: number, y: number) {
    const name = areaName(x, y);
    if (name === this.area) return;
    const first = this.area === "";
    this.area = name;
    const hud = document.getElementById("hud-area");
    if (hud) hud.textContent = name;
    if (!first) toast(name, 1800);
  }

  private createPlayerView(player: any, isMe: boolean): PlayerView {
    const textureKey = ensureAvatar(this, player.look || "");
    const dir = (player.dir as Direction) ?? "down";
    const shadow = this.add.ellipse(0, -1, 12, 4, 0x000000, 0.22);
    const sprite = this.add.sprite(0, 0, textureKey, frameIndex(dir, "stand")).setOrigin(0.5, 1);

    // Texto desenhado em tamanho de tela e reduzido pelo zoom: fica nítido.
    const label = this.add
      .text(0, -26, player.name, {
        fontFamily: '"Pixelify Sans", system-ui, sans-serif',
        fontSize: "15px",
        color: isMe ? "#ffe066" : "#ffffff",
        stroke: "#1f1a24",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setScale(1 / WORLD_ZOOM);

    const bubble = this.add.circle(0, 0, 4.5, 0xffffff).setStrokeStyle(1, 0x1f1a24);
    const mark = this.add
      .text(0, 0, "!", { fontFamily: "system-ui, sans-serif", fontSize: "21px", fontStyle: "bold", color: "#e5484d" })
      .setOrigin(0.5)
      .setScale(1 / WORLD_ZOOM);
    const battleIcon = this.add.container(9, -24, [bubble, mark]).setVisible(Boolean(player.inBattle));

    const x = player.x * TILE_SIZE + TILE_SIZE / 2;
    const y = (player.y + 1) * TILE_SIZE;
    if (!this.textures.exists("grass-overlay")) this.textures.addCanvas("grass-overlay", grassOverlay());
    const grass = this.add.image(0, 0, "grass-overlay").setOrigin(0.5, 1);
    grass.setVisible(tileAt(player.x, player.y) === Tile.TallGrass);
    const body = this.add.container(x, y, [shadow, sprite, grass, label, battleIcon]).setDepth(y);

    if (isMe) this.cameras.main.startFollow(body, true, 0.2, 0.2, 0, 12);
    return { body, sprite, battleIcon, grass, textureKey, dir, lastMoveAt: 0, walking: false };
  }

  // ---------- Entrada ----------

  private setupInput() {
    const kb = this.input.keyboard!;
    // Teclas de ação (só quando nada está aberto e ninguém está digitando)
    window.addEventListener("keydown", (e) => {
      if (inputBlocked() || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "e" || k === " ") {
        e.preventDefault();
        this.room.send("interact");
      } else if (k === "t") {
        openTeamPanel(this.room);
      } else if (k === "b" || k === "i") {
        openBagPanel(this.room);
      }
    });
    const C = Phaser.Input.Keyboard.KeyCodes;
    // enableCapture=false para não "roubar" as teclas do campo de chat.
    this.keys = {
      up: kb.addKey(C.UP, false),
      down: kb.addKey(C.DOWN, false),
      left: kb.addKey(C.LEFT, false),
      right: kb.addKey(C.RIGHT, false),
      w: kb.addKey(C.W, false),
      a: kb.addKey(C.A, false),
      s: kb.addKey(C.S, false),
      d: kb.addKey(C.D, false),
    };
  }

  private heldDirection(): Direction | null {
    const k = this.keys;
    if (k.up.isDown || k.w.isDown) return "up";
    if (k.down.isDown || k.s.isDown) return "down";
    if (k.left.isDown || k.a.isDown) return "left";
    if (k.right.isDown || k.d.isDown) return "right";
    return null;
  }

  private isTyping() {
    return document.activeElement?.id === "chat-input";
  }

  // ---------- Chat ----------

  private setupChat() {
    const log = document.getElementById("chat-log")!;
    const input = document.getElementById("chat-input") as HTMLInputElement;

    this.room.onMessage("chat", (msg: ChatBroadcast) => {
      const line = document.createElement("div");
      if (msg.system) {
        line.className = "sys";
        line.textContent = msg.text;
      } else {
        const who = document.createElement("b");
        who.textContent = `${msg.from}: `;
        line.append(who, document.createTextNode(msg.text));
      }
      log.append(line);
      log.scrollTop = log.scrollHeight;
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !inputBlocked()) {
        e.preventDefault();
        this.input.keyboard!.resetKeys();
        input.focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const text = input.value.trim();
        if (text) this.room.send("chat", { text });
        input.value = "";
        input.blur();
      } else if (e.key === "Escape") {
        input.blur();
      }
    });
  }
}
