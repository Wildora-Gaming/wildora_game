import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import {
  MOVE_COOLDOWN_MS,
  TILE_SIZE,
  type ChatBroadcast,
  type Direction,
} from "../../../shared/constants";
import { uiState } from "../ui-state";
import { MAP_HEIGHT, MAP_WIDTH, Tile, tileAt } from "../../../shared/map";

interface PlayerView {
  body: Phaser.GameObjects.Container;
  facing: Phaser.GameObjects.Triangle;
  /** Balão "!" sobre quem está em batalha */
  battleIcon: Phaser.GameObjects.Container;
}

const TILE_TEXTURE: Record<Tile, string> = {
  [Tile.Ground]: "t-ground",
  [Tile.Tree]: "t-tree",
  [Tile.TallGrass]: "t-grass",
  [Tile.Water]: "t-water",
  [Tile.Path]: "t-path",
};

const FACING_ANGLE: Record<string, number> = { up: 0, right: 90, down: 180, left: 270 };

export class WorldScene extends Phaser.Scene {
  private views = new Map<string, PlayerView>();
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private lastMoveSent = 0;
  private banner?: Phaser.GameObjects.Container;

  constructor(private room: Room) {
    super("world");
  }

  create() {
    this.makeTextures();
    this.drawMap();
    this.setupInput();
    this.bindRoom();
    this.setupChat();

    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.setZoom(1.5);
  }

  update(time: number) {
    if (this.isTyping() || uiState.inBattle) return;
    const dir = this.heldDirection();
    if (dir && time - this.lastMoveSent >= MOVE_COOLDOWN_MS) {
      this.lastMoveSent = time;
      this.room.send("move", { dir });
    }
  }

  // ---------- Mundo ----------

  private makeTextures() {
    const g = this.add.graphics();
    const s = TILE_SIZE;
    const tex = (key: string, draw: () => void) => {
      g.clear();
      draw();
      g.generateTexture(key, s, s);
    };

    tex("t-ground", () => {
      g.fillStyle(0x6fbf5a).fillRect(0, 0, s, s);
      g.fillStyle(0x7ccb66).fillRect(4, 6, 3, 3).fillRect(20, 18, 3, 3);
    });
    tex("t-path", () => {
      g.fillStyle(0xd8c08a).fillRect(0, 0, s, s);
      g.fillStyle(0xc9ae74).fillRect(6, 10, 4, 3).fillRect(22, 4, 3, 3).fillRect(14, 24, 4, 3);
    });
    tex("t-grass", () => {
      g.fillStyle(0x4f9e45).fillRect(0, 0, s, s);
      g.fillStyle(0x2f7a32);
      for (let i = 0; i < 4; i++) {
        const x = 3 + i * 8;
        g.fillTriangle(x, 28, x + 3, 12, x + 6, 28);
        g.fillTriangle(x + 2, 18, x + 5, 4, x + 8, 18);
      }
    });
    tex("t-water", () => {
      g.fillStyle(0x3a86c8).fillRect(0, 0, s, s);
      g.fillStyle(0x6fb3e8).fillRect(4, 8, 10, 2).fillRect(18, 20, 10, 2);
    });
    tex("t-tree", () => {
      g.fillStyle(0x6fbf5a).fillRect(0, 0, s, s);
      g.fillStyle(0x7a4a24).fillRect(13, 20, 6, 10);
      g.fillStyle(0x2b6b2e).fillCircle(16, 14, 12);
      g.fillStyle(0x3d8a3c).fillCircle(12, 11, 6);
    });
    g.destroy();
  }

  private drawMap() {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        this.add.image(x * TILE_SIZE, y * TILE_SIZE, TILE_TEXTURE[tileAt(x, y)]).setOrigin(0);
      }
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

      $(player).onChange(() => {
        view.facing.setAngle(FACING_ANGLE[player.dir] ?? 180);
        view.battleIcon.setVisible(Boolean(player.inBattle));
        const tx = this.tileCenter(player.x);
        const ty = this.tileCenter(player.y);
        const far = Math.abs(tx - view.body.x) + Math.abs(ty - view.body.y) > TILE_SIZE * 1.5;
        this.tweens.killTweensOf(view.body);
        if (far) {
          view.body.setPosition(tx, ty); // teleporte (ex.: voltou ao spawn após derrota)
        } else {
          this.tweens.add({ targets: view.body, x: tx, y: ty, duration: MOVE_COOLDOWN_MS, ease: "Linear" });
        }
      });
    });

    $(this.room.state).players.onRemove((_player: any, sessionId: string) => {
      this.views.get(sessionId)?.body.destroy();
      this.views.delete(sessionId);
      if (online) online.textContent = String(this.room.state.players.size);
    });

    this.room.onLeave(() => {
      this.showBanner("Conexão perdida. Recarregue a página.", 0);
    });
  }

  private createPlayerView(player: any, isMe: boolean): PlayerView {
    const shadow = this.add.ellipse(0, 11, 20, 7, 0x000000, 0.25);
    const body = this.add.rectangle(0, 0, 20, 22, player.color).setStrokeStyle(2, 0x1a1a1a);
    const facing = this.add.triangle(0, 0, 0, 6, 5, -2, 10, 6, 0xffffff).setOrigin(0.5, 1.6);
    facing.setAngle(FACING_ANGLE[player.dir] ?? 180);
    const label = this.add
      .text(0, -22, player.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        color: isMe ? "#ffc914" : "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setResolution(2);

    const container = this.add.container(this.tileCenter(player.x), this.tileCenter(player.y), [
      shadow,
      body,
      facing,
      label,
    ]);
    container.setDepth(isMe ? 20 : 10);

    const bubble = this.add.circle(0, 0, 8, 0xffffff).setStrokeStyle(2, 0x1a1a1a);
    const mark = this.add
      .text(0, 0, "!", { fontFamily: "system-ui, sans-serif", fontSize: "12px", fontStyle: "bold", color: "#e5484d" })
      .setOrigin(0.5)
      .setResolution(2);
    const battleIcon = this.add.container(14, -24, [bubble, mark]).setVisible(Boolean(player.inBattle));
    container.add(battleIcon);

    if (isMe) this.cameras.main.startFollow(container, true, 0.15, 0.15);
    return { body: container, facing, battleIcon };
  }

  private tileCenter(t: number) {
    return t * TILE_SIZE + TILE_SIZE / 2;
  }

  // ---------- Entrada ----------

  private setupInput() {
    const kb = this.input.keyboard!;
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

  // ---------- Chat e avisos ----------

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
      if (e.key === "Enter" && !this.isTyping()) {
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

  private showBanner(text: string, durationMs = 2500) {
    this.banner?.destroy();
    const cam = this.cameras.main;
    const label = this.add
      .text(0, 0, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#1a1a1a",
        fontStyle: "bold",
        padding: { x: 18, y: 12 },
        backgroundColor: "#ffc914",
      })
      .setOrigin(0.5)
      .setResolution(2);
    this.banner = this.add
      .container(cam.width / 2, 70, [label])
      .setScrollFactor(0)
      .setDepth(100)
      .setScale(1 / cam.zoom);
    // Container com scrollFactor 0 ainda sofre o zoom; compensa posição.
    this.banner.setPosition(cam.width / 2, cam.height / 2 - cam.height / (2 * cam.zoom) + 50 / cam.zoom);
    if (durationMs > 0) {
      this.time.delayedCall(durationMs, () => this.banner?.destroy());
    }
  }
}
