import Phaser from "phaser";
import { getStateCallbacks, type Room } from "colyseus.js";
import { MOVE_COOLDOWN_MS, TILE_SIZE, DIRECTION_DELTA, type ChatBroadcast, type Direction } from "../../../shared/constants";
import { MAP_HEIGHT, MAP_OBJECTS, MAP_WIDTH, Tile, isWalkable, tileAt } from "../../../shared/map";
import { inputBlocked } from "../ui-state";
import { openBagPanel, openTeamPanel } from "../panels/panels";
import { areaName } from "../../../shared/creatures";
import { grassOverlay, objectArt, objectKey, renderGround } from "../world/art";
import { ensureAvatar, frameIndex } from "../avatar/sheet";
import { toast } from "../toast";
import { sound } from "../audio/audio";

/** Zoom da câmera: cada pixel da arte vira um bloco de N pixels na tela (2 em celular, para ver mais do mapa). */
export const WORLD_ZOOM = Math.min(window.innerWidth, window.innerHeight) < 520 ? 2 : 3;

/**
 * Tempo de um passo no cliente. Um pouco acima do limite do servidor para nunca
 * esbarrar nele; o servidor ainda aceita pequenas rajadas causadas pela rede.
 */
const STEP_MS = MOVE_COOLDOWN_MS + 6;

/** Toque: segurando o direcional, o segundo passo só vem depois disso (um toque curto = um passo). */
const TOUCH_REPEAT_MS = 260;

/** Personagem desenhado no mundo, com o movimento de um tile para o outro. */
interface Mover {
  body: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  battleIcon: Phaser.GameObjects.Container;
  grass: Phaser.GameObjects.Image;
  textureKey: string;
  dir: Direction;
  /** tile atual (destino do passo em andamento) */
  tx: number;
  ty: number;
  fromX: number;
  fromY: number;
  moving: boolean;
  progress: number;
  /** quando parou de andar (para não piscar o quadro parado entre passos) */
  idleSince: number;
  /** jogadores remotos: próximos tiles a percorrer */
  queue: { x: number; y: number }[];
}

const px = (t: number) => t * TILE_SIZE + TILE_SIZE / 2;
const py = (t: number) => (t + 1) * TILE_SIZE;

export class WorldScene extends Phaser.Scene {
  private movers = new Map<string, Mover>();
  private me: Mover | null = null;
  private area = "";

  // movimento previsto do jogador local
  private seq = 0;
  private pending: { seq: number; x: number; y: number }[] = [];
  private bumped: Direction | null = null;

  /** direções seguradas, na ordem em que foram apertadas (a última vence) */
  private held: Direction[] = [];
  /** toque rápido durante um passo: executado assim que o passo termina */
  private buffered: Direction | null = null;
  /** direcional de toque: quando foi apertado e quantos passos já deu */
  private touchAt = 0;
  private touchSteps = -1;

  /** Tocou/clicou em outro jogador, ou apertou A/E de frente para ele. */
  onPlayerSelect: (sessionId: string, name: string) => void = () => {};

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

  private lastFrame = 0;

  update(time: number) {
    // Tempo real entre quadros: o delta do Phaser é suavizado e fica lento em máquinas fracas.
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 250) : 0;
    this.lastFrame = now;
    for (const m of this.movers.values()) {
      if (m === this.me) this.stepLocal(m, dt, time);
      else this.stepRemote(m, dt, time);
      m.body.setDepth(m.body.y);
    }
  }

  // ---------- Mundo ----------

  private drawWorld() {
    this.textures.addCanvas("ground", renderGround());
    this.add.image(0, 0, "ground").setOrigin(0).setDepth(-100000);

    for (const o of MAP_OBJECTS) {
      if (o.kind === "npc") {
        this.drawNpc(o);
        continue;
      }
      const key = objectKey(o);
      if (!this.textures.exists(key)) this.textures.addCanvas(key, objectArt(o));
      const x = o.x * TILE_SIZE + (o.w * TILE_SIZE) / 2;
      const y = (o.y + o.h) * TILE_SIZE;
      this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y);
    }
  }

  /** Líder do ginásio parado ao lado da porta, com o nome em cima. */
  private drawNpc(o: (typeof MAP_OBJECTS)[number]) {
    const key = ensureAvatar(this, o.look ?? "");
    const x = px(o.x);
    const y = py(o.y);
    this.add.ellipse(x, y - 1, 12, 4, 0x000000, 0.22).setDepth(y - 1);
    this.add.sprite(x, y, key, frameIndex("down", "stand")).setOrigin(0.5, 1).setDepth(y);
    this.add
      .text(x, y - 26, o.name ?? "", {
        fontFamily: '"Pixelify Sans", system-ui, sans-serif',
        fontSize: "14px",
        color: "#ffd84a",
        stroke: "#1f1a24",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setScale(1 / WORLD_ZOOM)
      .setDepth(y + 1);
  }

  // ---------- Movimento ----------

  private heldDirection(): Direction | null {
    return this.held.at(-1) ?? null;
  }

  /** Avança a animação de um passo; devolve o tempo que sobrou ao chegar (para emendar o próximo). */
  private advance(m: Mover, ms: number): number {
    if (!m.moving) return ms;
    m.progress += ms / STEP_MS;
    if (m.progress < 1) {
      m.body.setPosition(m.fromX + (px(m.tx) - m.fromX) * m.progress, m.fromY + (py(m.ty) - m.fromY) * m.progress);
      return 0;
    }
    const left = (m.progress - 1) * STEP_MS;
    m.moving = false;
    m.progress = 0;
    m.body.setPosition(px(m.tx), py(m.ty));
    this.arrived(m);
    return left;
  }

  private startStep(m: Mover, x: number, y: number, dir: Direction, carry: number) {
    m.fromX = m.body.x;
    m.fromY = m.body.y;
    m.tx = x;
    m.ty = y;
    m.dir = dir;
    m.moving = true;
    m.progress = 0;
    m.grass.setVisible(false);
    const anim = `${m.textureKey}:walk-${dir}`;
    if (m.sprite.anims.currentAnim?.key !== anim || !m.sprite.anims.isPlaying) m.sprite.play(anim, true);
    if (carry > 0) this.advance(m, carry);
  }

  private arrived(m: Mover) {
    const grass = tileAt(m.tx, m.ty) === Tile.TallGrass;
    m.grass.setVisible(grass);
    if (grass && m === this.me) sound.sfx("grass");
    if (m === this.me) this.updateArea(m.tx, m.ty);
  }

  private idle(m: Mover, time: number) {
    if (m.idleSince === 0) m.idleSince = time;
    // pequena tolerância: entre dois passos seguidos não volta para o quadro parado
    if (time - m.idleSince > 40 && m.sprite.anims.isPlaying) {
      m.sprite.stop();
      m.sprite.setFrame(frameIndex(m.dir, "stand"));
    }
  }

  private face(m: Mover, dir: Direction) {
    if (m.dir === dir) return;
    m.dir = dir;
    if (!m.moving) m.sprite.setFrame(frameIndex(dir, "stand"));
  }

  /** Jogador local: anda na hora e avisa o servidor (que confere e corrige se precisar). */
  private stepLocal(m: Mover, dt: number, time: number) {
    const carry = this.advance(m, dt);
    if (m.moving) return;

    let dir = inputBlocked() ? null : this.heldDirection() ?? this.buffered;
    if (dir && this.touchSteps >= 1 && performance.now() - this.touchAt < TOUCH_REPEAT_MS) {
      // toque curto: espera um instante antes de repetir o passo
      this.idle(m, time);
      return;
    }
    this.buffered = null;
    if (!dir) {
      this.bumped = null;
      this.idle(m, time);
      return;
    }

    const { dx, dy } = DIRECTION_DELTA[dir];
    const nx = m.tx + dx;
    const ny = m.ty + dy;
    if (isWalkable(nx, ny)) {
      this.sendMove(dir, nx, ny);
      if (this.touchSteps >= 0) this.touchSteps += 1;
      m.idleSince = 0;
      this.bumped = null;
      this.startStep(m, nx, ny, dir, carry);
    } else {
      // bloqueado: vira para o obstáculo e avisa uma vez (abre portas da vila)
      this.face(m, dir);
      this.idle(m, time);
      if (this.bumped !== dir) {
        this.bumped = dir;
        sound.sfx("bump");
        this.sendMove(dir, m.tx, m.ty);
      }
    }
  }

  private sendMove(dir: Direction, x: number, y: number) {
    this.seq += 1;
    this.pending.push({ seq: this.seq, x, y });
    this.room.send("move", { dir, seq: this.seq });
  }

  /** Jogadores remotos: percorrem a fila de tiles em velocidade constante (mais rápido se atrasar). */
  private stepRemote(m: Mover, dt: number, time: number) {
    // fila cheia: acelera para alcançar; fila vazia: desacelera um pouco para o próximo passo chegar a tempo
    let left = dt * (m.queue.length >= 2 ? 1.5 : m.queue.length === 1 ? 1 : 0.85);
    for (let i = 0; i < 4; i++) {
      left = this.advance(m, left);
      if (m.moving) return;
      const next = m.queue.shift();
      if (!next) break;
      const dir: Direction = next.x > m.tx ? "right" : next.x < m.tx ? "left" : next.y > m.ty ? "down" : "up";
      m.idleSince = 0;
      this.startStep(m, next.x, next.y, dir, 0);
    }
    if (!m.moving) this.idle(m, time);
  }

  private teleport(m: Mover, x: number, y: number) {
    m.moving = false;
    m.progress = 0;
    m.queue = [];
    m.tx = x;
    m.ty = y;
    m.body.setPosition(px(x), py(y));
    m.sprite.stop();
    m.sprite.setFrame(frameIndex(m.dir, "stand"));
    this.arrived(m);
  }

  // ---------- Rede ----------

  private bindRoom() {
    const $ = getStateCallbacks(this.room);
    const online = document.getElementById("hud-online");

    $(this.room.state).players.onAdd((player: any, sessionId: string) => {
      const isMe = sessionId === this.room.sessionId;
      const m = this.createMover(player, isMe, sessionId);
      this.movers.set(sessionId, m);
      if (isMe) {
        this.me = m;
        this.seq = player.seq ?? 0;
        this.updateArea(player.x, player.y);
      }
      if (online) online.textContent = String(this.room.state.players.size);
      $(player).onChange(() => (isMe ? this.syncMe(m, player) : this.syncRemote(m, player)));
    });

    $(this.room.state).players.onRemove((_player: any, sessionId: string) => {
      this.movers.get(sessionId)?.body.destroy();
      this.movers.delete(sessionId);
      if (online) online.textContent = String(this.room.state.players.size);
    });

    this.room.onLeave(() => toast("Conexão perdida. Recarregue a página.", 0));

    // Batalha começou: descarta passos previstos que o servidor vai recusar
    this.room.onMessage("battle_start", () => {
      this.held = [];
    });

    // Dia e noite
    const night = document.getElementById("night");
    const clock = document.getElementById("hud-clock");
    $(this.room.state).listen("night", (isNight: boolean) => {
      night?.classList.toggle("on", isNight);
      sound.setNight(isNight);
      if (clock) clock.textContent = isNight ? "· Noite" : "· Dia";
    });
  }

  private syncLook(m: Mover, player: any) {
    m.battleIcon.setVisible(Boolean(player.inBattle));
    if (player.look) {
      const key = ensureAvatar(this, player.look);
      if (key !== m.textureKey) {
        m.textureKey = key;
        m.sprite.setTexture(key, frameIndex(m.dir, "stand"));
      }
    }
  }

  /** Confere a posição prevista com a confirmada pelo servidor. */
  private syncMe(m: Mover, player: any) {
    this.syncLook(m, player);
    const acked: number = player.seq ?? 0;
    let expected: { x: number; y: number } | undefined;
    while (this.pending.length && this.pending[0].seq <= acked) expected = this.pending.shift();

    if (expected) {
      if (expected.x !== player.x || expected.y !== player.y) this.correct(m, player.x, player.y);
    } else if (!this.pending.length && (m.tx !== player.x || m.ty !== player.y)) {
      // mudou sem pedido nosso (ex.: voltou ao Centro de Cura depois de perder)
      this.correct(m, player.x, player.y);
    }
  }

  private correct(m: Mover, x: number, y: number) {
    this.pending = [];
    this.teleport(m, x, y);
  }

  private syncRemote(m: Mover, player: any) {
    this.syncLook(m, player);
    const last = m.queue.at(-1) ?? { x: m.tx, y: m.ty };
    const dist = Math.abs(player.x - last.x) + Math.abs(player.y - last.y);
    if (dist === 0) {
      if (!m.moving && !m.queue.length) this.face(m, player.dir);
    } else if (dist === 1 && m.queue.length < 6) {
      m.queue.push({ x: player.x, y: player.y });
    } else {
      m.dir = player.dir;
      this.teleport(m, player.x, player.y);
    }
  }

  private updateArea(x: number, y: number) {
    const name = areaName(x, y);
    if (name === this.area) return;
    sound.setArea(name);
    const first = this.area === "";
    this.area = name;
    const hud = document.getElementById("hud-area");
    if (hud) hud.textContent = name;
    if (!first) toast(name, 1800);
  }

  private createMover(player: any, isMe: boolean, sessionId: string): Mover {
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

    if (!this.textures.exists("grass-overlay")) this.textures.addCanvas("grass-overlay", grassOverlay());
    const grass = this.add.image(0, 0, "grass-overlay").setOrigin(0.5, 1);
    grass.setVisible(tileAt(player.x, player.y) === Tile.TallGrass);
    const body = this.add.container(px(player.x), py(player.y), [shadow, sprite, grass, label, battleIcon]);
    body.setDepth(body.y);

    // câmera presa no personagem, sem atraso
    if (isMe) this.cameras.main.startFollow(body, true, 1, 1, 0, 12);
    else {
      // tocar/clicar em outro jogador abre o menu de batalha e troca (área generosa para o dedo)
      body.setSize(20, 30);
      // (a área é contada a partir do canto do tamanho 20×30, centrado nos pés)
      body.setInteractive(new Phaser.Geom.Rectangle(0, -13, 20, 30), Phaser.Geom.Rectangle.Contains);
      body.on("pointerup", () => {
        if (!inputBlocked()) this.onPlayerSelect(sessionId, player.name);
      });
    }
    return {
      body,
      sprite,
      battleIcon,
      grass,
      textureKey,
      dir,
      tx: player.x,
      ty: player.y,
      fromX: body.x,
      fromY: body.y,
      moving: false,
      progress: 0,
      idleSince: 0,
      queue: [],
    };
  }

  // ---------- Entrada ----------

  /** Direcional de toque: segura uma direção (null = soltou). */
  touchMove(dir: Direction | null) {
    if (!dir) {
      this.held = [];
      this.touchSteps = -1;
      return;
    }
    if (inputBlocked()) return;
    if (this.held[0] !== dir) {
      // direção nova (ou arrastou o dedo para outra): conta de novo
      this.touchAt = performance.now();
      this.touchSteps = 0;
    }
    this.held = [dir];
    // toque rápido nunca se perde: se estiver no meio de um passo, o próximo já fica guardado
    this.buffered = dir;
  }

  interact() {
    if (inputBlocked()) return;
    const ahead = this.playerAhead();
    if (ahead) this.onPlayerSelect(ahead.id, ahead.name);
    else this.room.send("interact");
  }

  /** Jogador parado no tile à frente do personagem. */
  private playerAhead(): { id: string; name: string } | null {
    const me = this.me;
    if (!me) return null;
    const { dx, dy } = DIRECTION_DELTA[me.dir];
    const x = me.tx + dx;
    const y = me.ty + dy;
    for (const [id, m] of this.movers) {
      if (m === me || m.tx !== x || m.ty !== y) continue;
      const p = this.room.state.players.get(id);
      return { id, name: p?.name ?? "" };
    }
    return null;
  }

  /** Abre o chat (botão de toque). */
  openChat() {
    this.held = [];
    document.documentElement.classList.add("chat-open");
    const input = document.getElementById("chat-input") as HTMLInputElement;
    input.focus();
  }

  private setupInput() {
    const KEYS: Record<string, Direction> = {
      arrowup: "up",
      w: "up",
      arrowdown: "down",
      s: "down",
      arrowleft: "left",
      a: "left",
      arrowright: "right",
      d: "right",
    };

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      const dir = KEYS[k];
      if (dir) {
        if (inputBlocked()) return;
        if (k.startsWith("arrow")) e.preventDefault();
        this.held = this.held.filter((d) => d !== dir);
        this.held.push(dir);
        if (!e.repeat && this.me?.moving) this.buffered = dir;
        return;
      }
      if (inputBlocked() || e.repeat) return;
      if (k === "e" || k === " ") {
        e.preventDefault();
        this.interact();
      } else if (k === "t") {
        this.held = [];
        openTeamPanel(this.room);
      } else if (k === "b" || k === "i") {
        this.held = [];
        openBagPanel(this.room);
      }
    });
    window.addEventListener("keyup", (e) => {
      const dir = KEYS[e.key.toLowerCase()];
      if (dir) this.held = this.held.filter((d) => d !== dir);
    });
    // soltar tudo ao trocar de janela (senão o personagem segue andando sozinho)
    const release = () => {
      this.held = [];
      this.buffered = null;
    };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
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
        this.held = [];
        input.focus();
      }
    });

    const close = () => document.documentElement.classList.remove("chat-open");
    input.addEventListener("blur", () => window.setTimeout(close, 50));
    document.querySelector(".chat-close")?.addEventListener("click", () => input.blur());

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
