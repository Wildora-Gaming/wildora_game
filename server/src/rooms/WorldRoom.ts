import { Room, Client, ServerError } from "@colyseus/core";
import { Player, WorldState } from "../schema/WorldState";
import type { Store, Trainer } from "../store";
import {
  BATTLE_ACTION_COOLDOWN_MS,
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  DIRECTION_DELTA,
  ENCOUNTER_CHANCE,
  MAX_PLAYERS_PER_ROOM,
  MOVE_BURST,
  MOVE_COOLDOWN_MS,
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  TEAM_MAX,
  isDirection,
  isNightAt,
  type BattleStartMessage,
  type BattleTurnMessage,
  type ChatBroadcast,
  type DialogMessage,
  type GymOfferMessage,
  type NoticeMessage,
  type ProfileMessage,
  type ShopMessage,
} from "../../../shared/constants";
import { HEAL_POINT, SPAWN, Tile, doorOf, isWalkable, objectAt, tileAt } from "../../../shared/map";
import { rollWild, zoneAt } from "../../../shared/creatures";
import { getGym, gymStages, type Gym } from "../../../shared/gyms";
import { TYPE_LABEL } from "../../../shared/battle/types";
import { sanitizeLook } from "../../../shared/avatar/look";
import { STARTERS, STARTER_LEVEL, getSpecies, isSpeciesId } from "../../../shared/battle/data";
import { SHOP_ITEMS, STARTING_BAG, STARTING_MONEY, getItem, moneyReward } from "../../../shared/items";
import {
  activeOf,
  awardExperience,
  calcStats,
  chooseTrainerAction,
  chooseWildAction,
  createCreature,
  healFully,
  isValidAction,
  resolveTurn,
  startBattle,
  toView,
  type BattleEvent,
  type BattleState,
} from "../../../shared/battle/engine";

interface JoinOptions {
  mode?: unknown;
  name?: unknown;
  password?: unknown;
  starter?: unknown;
  look?: unknown;
}

/** Dados por conexão que não vão para o estado público. */
interface Session {
  trainer: Trainer;
  lastMoveAt: number;
  /** passos disponíveis (balde que enche 1 a cada MOVE_COOLDOWN_MS) */
  moveTokens: number;
  lastChatAt: number;
  lastActionAt: number;
  battle: BattleState | null;
  battleZone: string;
  /** desafio de ginásio em andamento: qual treinador está sendo enfrentado */
  gymRun: { gymId: string; stage: number } | null;
}

const PLAYER_COLORS = [0xe4572e, 0x17bebb, 0xffc914, 0x76b041, 0x9b5de5, 0xf15bb5, 0x00bbf9, 0xfee440];

/** Contas conectadas em qualquer sala deste processo (impede login duplo). */
const ONLINE = new Set<string>();

function cleanName(raw: unknown): string {
  const base = typeof raw === "string" ? raw : "";
  return base.replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  /** Armazenamento compartilhado por todas as salas (definido ao iniciar o servidor). */
  static store: Store;
  private sessions = new Map<string, Session>();
  private get store() {
    return WorldRoom.store;
  }

  /** Permite injetar RNG determinístico nos testes. */
  rng: () => number = Math.random;
  /** Relógio do dia/noite. WILDORA_TIME_OFFSET (ms) adianta o relógio para testar a noite. */
  now: () => number = () => Date.now() + Number(process.env.WILDORA_TIME_OFFSET ?? 0);

  onCreate() {
    this.setState(new WorldState());
    this.state.night = isNightAt(this.now());
    this.clock.setInterval(() => {
      const night = isNightAt(this.now());
      if (night !== this.state.night) {
        this.state.night = night;
        this.broadcastSystem(night ? "A noite caiu sobre a Vila Broto." : "Amanheceu na Vila Broto.");
      }
    }, 5000);
    // salvamento periódico das posições
    this.clock.setInterval(() => this.store.markDirty(), 15000);

    this.onMessage("move", (client, m: unknown) => this.handleMove(client, m));
    this.onMessage("chat", (client, m: unknown) => this.handleChat(client, m));
    this.onMessage("battle_action", (client, m: unknown) => this.handleBattleAction(client, m));
    this.onMessage("interact", (client) => this.handleInteract(client));
    this.onMessage("buy", (client, m: unknown) => this.handleBuy(client, m));
    this.onMessage("use_item", (client, m: unknown) => this.handleUseItem(client, m));
    this.onMessage("team_order", (client, m: unknown) => this.handleTeamOrder(client, m));
    this.onMessage("box_deposit", (client, m: unknown) => this.handleBox(client, m, "deposit"));
    this.onMessage("box_withdraw", (client, m: unknown) => this.handleBox(client, m, "withdraw"));
    this.onMessage("gym_challenge", (client, m: unknown) => this.handleGymChallenge(client, m));
    this.onMessage("*", () => {});
  }

  // ---------- Conta ----------

  onAuth(_client: Client, options: JoinOptions = {}) {
    const name = cleanName(options.name);
    const password = typeof options.password === "string" ? options.password : "";
    if (name.length < 2) throw new ServerError(400, "Escolha um nome com pelo menos 2 letras.");
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new ServerError(400, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    }

    if (options.mode === "register") {
      if (this.store.findByName(name)) throw new ServerError(409, "Esse nome já está em uso. Escolha outro.");
      const starter = isSpeciesId(options.starter) && STARTERS.includes(options.starter) ? options.starter : STARTERS[0];
      const trainer = this.store.create(name, password, {
        look: sanitizeLook(options.look),
        x: SPAWN.x,
        y: SPAWN.y,
        dir: "down",
        money: STARTING_MONEY,
        bag: { ...STARTING_BAG },
        team: [createCreature(starter, STARTER_LEVEL)],
        box: [],
        dex: { seen: [starter], caught: [starter] },
        stats: { wins: 0, caught: 0 },
        badges: [],
      });
      this.store.flush();
      return trainer;
    }

    const trainer = this.store.findByName(name);
    if (!trainer || !this.store.checkPassword(trainer, password)) throw new ServerError(401, "Nome ou senha incorretos.");
    if (ONLINE.has(trainer.id)) throw new ServerError(409, "Essa conta já está conectada em outra janela.");
    if (options.look !== undefined) trainer.look = sanitizeLook(options.look);
    return trainer;
  }

  onJoin(client: Client, _options: JoinOptions, trainer: Trainer) {
    ONLINE.add(trainer.id);
    const start = isWalkable(trainer.x, trainer.y) ? trainer : SPAWN;
    const player = Player.create(trainer.name, start.x, start.y, PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length]);
    player.look = trainer.look;
    player.dir = isDirection(trainer.dir) ? trainer.dir : "down";
    this.state.players.set(client.sessionId, player);
    this.sessions.set(client.sessionId, {
      trainer,
      lastMoveAt: Date.now(),
      moveTokens: MOVE_BURST,
      lastChatAt: 0,
      lastActionAt: 0,
      battle: null,
      battleZone: "",
      gymRun: null,
    });
    trainer.lastSeen = Date.now();
    this.sendProfile(client);
    this.broadcastSystem(`${trainer.name} chegou à Vila Broto.`);
  }

  onLeave(client: Client) {
    const s = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (s && player) {
      // Sair no meio de uma batalha conta como fuga; Vida e XP ficam como estão.
      s.trainer.x = player.x;
      s.trainer.y = player.y;
      s.trainer.dir = player.dir;
      s.trainer.lastSeen = Date.now();
      for (const c of s.trainer.team) {
        if (c.status === "assustado") c.status = null;
      }
      ONLINE.delete(s.trainer.id);
      this.store.markDirty();
    }
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    if (player) this.broadcastSystem(`${player.name} saiu.`);
  }

  onDispose() {
    this.store?.flush();
  }

  private sendProfile(client: Client) {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    const t = s.trainer;
    const msg: ProfileMessage = {
      name: t.name,
      money: t.money,
      bag: t.bag,
      team: t.team.map((c) => toView(c)),
      box: t.box.map((c) => toView(c)),
      dex: { seen: t.dex.seen.length, caught: t.dex.caught.length },
      badges: t.badges,
    };
    client.send("profile", msg);
  }

  private notice(client: Client, text: string) {
    const msg: NoticeMessage = { text };
    client.send("notice", msg);
  }

  private ready(client: Client): { s: Session; player: Player } | null {
    const s = this.sessions.get(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    return s && player ? { s, player } : null;
  }

  // ---------- Movimento ----------

  private handleMove(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r) return;
    const { s, player } = r;

    const m = message as { dir?: unknown; seq?: unknown } | null;
    const dir = m?.dir;
    if (!isDirection(dir)) return;
    const seq = Number(m?.seq);
    // Sempre confirma o número do pedido, aceito ou não: o cliente corrige a previsão se precisar.
    const ack = () => {
      if (Number.isInteger(seq) && seq > player.seq && seq < 2 ** 32) player.seq = seq;
    };

    if (s.battle) return ack(); // em batalha não anda

    // O servidor é a autoridade: limita a velocidade média com um balde de passos.
    const now = Date.now();
    s.moveTokens = Math.min(MOVE_BURST, s.moveTokens + (now - s.lastMoveAt) / MOVE_COOLDOWN_MS);
    s.lastMoveAt = now;
    if (s.moveTokens < 1) return ack();
    s.moveTokens -= 1;

    player.dir = dir;
    const { dx, dy } = DIRECTION_DELTA[dir];
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!isWalkable(nx, ny)) {
      ack();
      // Andar contra a porta do Centro de Cura ou da Loja já entra
      const obj = objectAt(nx, ny);
      if (obj?.role && dir === "up") {
        const door = doorOf(obj);
        if (door.x === nx && door.y === ny) this.interactWith(client, s, obj, nx, ny);
      }
      return; // só vira de lado
    }

    player.x = nx;
    player.y = ny;
    s.trainer.x = nx;
    s.trainer.y = ny;
    ack();

    if (tileAt(nx, ny) === Tile.TallGrass && this.rng() < ENCOUNTER_CHANCE) {
      const zone = zoneAt(nx, ny);
      const { entry, level } = rollWild(zone.table, this.rng, this.state.night);
      this.beginWildBattle(client, player, s, createCreature(entry.speciesId, level), zone.name);
    }
  }

  // ---------- Batalha ----------

  private beginWildBattle(client: Client, player: Player, s: Session, wild: ReturnType<typeof createCreature>, zone: string) {
    if (!s.trainer.team.some((c) => c.hp > 0)) {
      // time todo desmaiado (não deveria acontecer): recupera antes
      for (const c of s.trainer.team) healFully(c);
    }
    s.battle = startBattle(s.trainer.team, wild, true);
    s.battleZone = zone;
    player.inBattle = true;
    if (!s.trainer.dex.seen.includes(wild.speciesId)) s.trainer.dex.seen.push(wild.speciesId);
    const msg: BattleStartMessage = {
      wild: true,
      foeCount: 1,
      team: s.trainer.team.map((c) => toView(c)),
      active: s.battle.active,
      foe: toView(wild, false),
      zone,
    };
    client.send("battle_start", msg);
  }

  private handleBattleAction(client: Client, message: unknown) {
    const r = this.ready(client);
    const battle = r?.s.battle;
    if (!r || !battle || battle.result) return;
    const { s, player } = r;
    if (!isValidAction(battle, message)) return;

    // itens precisam estar na mochila
    if (message.kind === "item") {
      if ((s.trainer.bag[message.itemId] ?? 0) <= 0) return;
    }

    const now = Date.now();
    if (now - s.lastActionAt < BATTLE_ACTION_COOLDOWN_MS) return;
    s.lastActionAt = now;

    if (message.kind === "item") {
      s.trainer.bag[message.itemId] -= 1;
      if (s.trainer.bag[message.itemId] <= 0) delete s.trainer.bag[message.itemId];
    }

    const stage = s.gymRun ? gymStages(getGym(s.gymRun.gymId)!)[s.gymRun.stage] : null;
    const foeAction = battle.wild ? chooseWildAction(battle, this.rng) : chooseTrainerAction(battle, this.rng, stage?.smart);
    const events: BattleEvent[] = resolveTurn(battle, message, foeAction, this.rng);
    const t = s.trainer;
    let next: (() => void) | null = null;

    if (battle.result === "win" || battle.result === "caught") {
      const end = events.pop()!;
      if (battle.result === "caught") {
        const caught = battle.foe;
        caught.status = null;
        caught.statusTurns = 0;
        const name = getSpecies(caught.speciesId).name;
        if (t.team.length < TEAM_MAX) {
          t.team.push(caught);
          events.push({ t: "sent", where: "team", name });
        } else {
          t.box.push(caught);
          events.push({ t: "sent", where: "box", name });
        }
        if (!t.dex.caught.includes(caught.speciesId)) t.dex.caught.push(caught.speciesId);
        t.stats.caught += 1;
      } else {
        t.stats.wins += 1;
      }
      // a vitória já trouxe o XP do motor; a captura ganha XP aqui
      if (battle.result === "caught") events.push(...awardExperience(battle));
      const money = stage ? stage.reward : moneyReward(battle.foe.level);
      t.money += money;
      events.push({ t: "money", amount: money });
      events.push(end);
      if (s.gymRun && battle.result === "win") next = this.advanceGym(client, player, s);
    } else if (battle.result === "lose") {
      s.gymRun = null;
      // Volta ao Centro de Cura com o time recuperado e perde um pouco de Sementes.
      for (const c of t.team) healFully(c);
      t.money = Math.max(0, t.money - Math.floor(t.money * 0.1));
      player.x = HEAL_POINT.x;
      player.y = HEAL_POINT.y;
      player.dir = "down";
      t.x = player.x;
      t.y = player.y;
    }

    // Estados de susto não passam da batalha
    if (battle.result) {
      for (const c of t.team) if (c.status === "assustado") c.status = null;
    }

    const over = battle.result !== null;
    const msg: BattleTurnMessage = {
      events,
      team: t.team.map((c) => toView(c)),
      active: battle.active,
      foe: toView(battle.foe, false),
      over,
      needSwitch: battle.needSwitch,
      bag: t.bag,
    };
    client.send("battle_turn", msg);

    if (over) {
      s.battle = null;
      player.inBattle = false;
      this.store.markDirty();
      this.sendProfile(client);
      next?.();
    }
  }

  // ---------- Ginásios ----------

  private sendGymOffer(client: Client, s: Session, gym: Gym) {
    const msg: GymOfferMessage = {
      gymId: gym.id,
      name: gym.name,
      type: TYPE_LABEL[gym.type],
      badge: gym.badge,
      level: gym.level,
      leader: gym.leader.name,
      quote: gym.quote,
      trainers: gym.trainers.length,
      hasBadge: s.trainer.badges.includes(gym.id),
      badges: s.trainer.badges.length,
    };
    client.send("gym_offer", msg);
  }

  private handleGymChallenge(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle) return;
    const { s, player } = r;
    const gym = getGym((message as { gymId?: unknown } | null)?.gymId);
    if (!gym) return;
    // precisa estar na porta do ginásio
    const near = [[0, -1], [0, 0], [-1, 0], [1, 0]].some(([dx, dy]) => {
      const o = objectAt(player.x + dx, player.y + dy);
      return o?.kind === "gym" && o.gymId === gym.id;
    });
    if (!near) return;
    if (!s.trainer.team.some((c) => c.hp > 0)) return this.notice(client, "Seu time precisa se recuperar no Centro de Cura antes.");
    s.gymRun = { gymId: gym.id, stage: 0 };
    this.beginTrainerBattle(client, player, s, gym, 0);
  }

  private beginTrainerBattle(client: Client, player: Player, s: Session, gym: Gym, stage: number) {
    const trainer = gymStages(gym)[stage];
    const foes = trainer.team.map(([species, level]) => createCreature(species, level));
    s.battle = startBattle(s.trainer.team, foes, false);
    s.battleZone = gym.name;
    player.inBattle = true;
    for (const f of foes) if (!s.trainer.dex.seen.includes(f.speciesId)) s.trainer.dex.seen.push(f.speciesId);
    const msg: BattleStartMessage = {
      wild: false,
      trainer: { name: trainer.name, title: trainer.title, look: trainer.look },
      foeCount: foes.length,
      team: s.trainer.team.map((c) => toView(c)),
      active: s.battle.active,
      foe: toView(foes[0], false),
      zone: gym.name,
    };
    client.send("battle_start", msg);
  }

  /** Depois de vencer um treinador do ginásio: próximo da fila ou insígnia. */
  private advanceGym(client: Client, player: Player, s: Session): () => void {
    const run = s.gymRun!;
    const gym = getGym(run.gymId)!;
    const stages = gymStages(gym);
    if (run.stage + 1 < stages.length) {
      run.stage += 1;
      return () => this.beginTrainerBattle(client, player, s, gym, run.stage);
    }
    s.gymRun = null;
    const t = s.trainer;
    const first = !t.badges.includes(gym.id);
    if (first) {
      t.badges.push(gym.id);
      for (const [id, n] of Object.entries(gym.prize)) t.bag[id] = (t.bag[id] ?? 0) + n;
    }
    return () => {
      const prize = Object.entries(gym.prize)
        .map(([id, n]) => `${n}× ${getItem(id)?.name ?? id}`)
        .join(", ");
      const msg: DialogMessage = first
        ? {
            title: gym.badge,
            text: `Você venceu ${gym.leader.name}, líder do ${gym.name}, e ganhou a ${gym.badge}! Prêmio: ${prize}. Insígnias: ${t.badges.length} de 8.`,
          }
        : { title: gym.name, text: `Você venceu ${gym.leader.name} de novo! Já tinha a ${gym.badge}.` };
      client.send("dialog", msg);
      this.store.markDirty();
      this.sendProfile(client);
    };
  }

  // ---------- Vila: interações ----------

  private handleInteract(client: Client) {
    const r = this.ready(client);
    if (!r || r.s.battle) return;
    const { s, player } = r;
    const now = Date.now();
    if (now - s.lastActionAt < BATTLE_ACTION_COOLDOWN_MS) return;
    s.lastActionAt = now;

    const { dx, dy } = DIRECTION_DELTA[isDirection(player.dir) ? player.dir : "down"];
    const tx = player.x + dx;
    const ty = player.y + dy;
    const obj = objectAt(tx, ty);
    if (obj) this.interactWith(client, s, obj, tx, ty);
  }

  private interactWith(client: Client, s: Session, obj: NonNullable<ReturnType<typeof objectAt>>, tx: number, ty: number) {
    const dialog = (title: string, text: string) => {
      const msg: DialogMessage = { title, text };
      client.send("dialog", msg);
    };

    if (obj.kind === "house" && obj.role) {
      // qualquer ponto da fachada serve (não precisa acertar a porta)
      if (ty !== obj.y + obj.h - 1) return;
      void tx;
      if (obj.role === "heal") {
        for (const c of s.trainer.team) healFully(c);
        this.store.markDirty();
        this.sendProfile(client);
        dialog("Centro de Cura", "Seu time foi totalmente recuperado. Volte sempre que precisar!");
      } else {
        const msg: ShopMessage = {
          items: SHOP_ITEMS.map((id) => {
            const it = getItem(id)!;
            return { id, name: it.name, description: it.description, price: it.price ?? 0 };
          }),
          money: s.trainer.money,
        };
        client.send("shop", msg);
      }
    } else if (obj.kind === "house") {
      dialog("Casa", "A porta está trancada. Parece que ninguém está em casa.");
    } else if (obj.kind === "gym" && obj.gymId) {
      const gym = getGym(obj.gymId);
      if (gym && ty === obj.y + obj.h - 1) this.sendGymOffer(client, s, gym);
    } else if (obj.kind === "npc" && obj.gymId) {
      const gym = getGym(obj.gymId)!;
      const has = s.trainer.badges.includes(gym.id);
      dialog(
        `${gym.leader.name}, líder do ${gym.name}`,
        has
          ? `Você já tem a ${gym.badge}. Volte quando quiser uma revanche!`
          : `${gym.quote} Entre no ginásio quando estiver pronto. Sugiro um time por volta do nível ${gym.level}.`,
      );
    } else if (obj.kind === "sign" && obj.text) {
      dialog("Placa", obj.text);
    } else if (obj.kind === "well") {
      dialog("Poço", "A água é fresquinha. Dizem que as criaturas da vila vêm beber aqui à noite.");
    }
  }

  private handleBuy(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle) return;
    const m = message as { itemId?: unknown; qty?: unknown } | null;
    const item = getItem(m?.itemId);
    const qty = Number(m?.qty);
    if (!item || item.price === null || !SHOP_ITEMS.includes(item.id)) return;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return;
    if (!this.nearShop(r.player)) return;
    const t = r.s.trainer;
    const cost = item.price * qty;
    if (t.money < cost) return this.notice(client, "Sementes insuficientes.");
    t.money -= cost;
    t.bag[item.id] = (t.bag[item.id] ?? 0) + qty;
    this.store.markDirty();
    this.sendProfile(client);
    this.notice(client, `Você comprou ${qty}× ${item.name}.`);
  }

  private nearShop(player: Player) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
      const o = objectAt(player.x + dx, player.y + dy);
      if (o?.role === "shop") return true;
    }
    return false;
  }

  private handleUseItem(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle) return;
    const m = message as { itemId?: unknown; target?: unknown } | null;
    const item = getItem(m?.itemId);
    const t = r.s.trainer;
    const target = Number(m?.target);
    if (!item || item.kind !== "heal" || (t.bag[item.id] ?? 0) <= 0) return;
    if (!Number.isInteger(target) || target < 0 || target >= t.team.length) return;
    const c = t.team[target];
    const max = calcStats(c).maxHp;
    if (c.hp >= max) return this.notice(client, "Essa criatura já está com a Vida cheia.");
    c.hp = Math.min(max, c.hp + item.power);
    t.bag[item.id] -= 1;
    if (t.bag[item.id] <= 0) delete t.bag[item.id];
    this.store.markDirty();
    this.sendProfile(client);
    this.notice(client, `${getSpecies(c.speciesId).name} recuperou Vida.`);
  }

  private handleTeamOrder(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle) return;
    const m = message as { from?: unknown; to?: unknown } | null;
    const team = r.s.trainer.team;
    const from = Number(m?.from);
    const to = Number(m?.to);
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n < team.length;
    if (!ok(from) || !ok(to) || from === to) return;
    const [c] = team.splice(from, 1);
    team.splice(to, 0, c);
    this.store.markDirty();
    this.sendProfile(client);
  }

  private handleBox(client: Client, message: unknown, op: "deposit" | "withdraw") {
    const r = this.ready(client);
    if (!r || r.s.battle) return;
    const t = r.s.trainer;
    const index = Number((message as { index?: unknown } | null)?.index);
    if (op === "deposit") {
      if (!Number.isInteger(index) || index < 0 || index >= t.team.length) return;
      if (t.team.length <= 1) return this.notice(client, "Você precisa de pelo menos uma criatura no time.");
      t.box.push(...t.team.splice(index, 1));
    } else {
      if (!Number.isInteger(index) || index < 0 || index >= t.box.length) return;
      if (t.team.length >= TEAM_MAX) return this.notice(client, `O time já tem ${TEAM_MAX} criaturas.`);
      t.team.push(...t.box.splice(index, 1));
    }
    this.store.markDirty();
    this.sendProfile(client);
  }

  // ---------- Chat ----------

  private handleChat(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r) return;
    const raw = (message as { text?: unknown } | null)?.text;
    if (typeof raw !== "string") return;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;

    const now = Date.now();
    if (now - r.s.lastChatAt < CHAT_COOLDOWN_MS) return;
    r.s.lastChatAt = now;

    const payload: ChatBroadcast = { from: r.player.name, text };
    this.broadcast("chat", payload);
  }

  private broadcastSystem(text: string) {
    const payload: ChatBroadcast = { from: "", text, system: true };
    this.broadcast("chat", payload);
  }
}

// Para testes e depuração
export { activeOf };
