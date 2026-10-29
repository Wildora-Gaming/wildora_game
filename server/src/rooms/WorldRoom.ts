import { Room, Client, ServerError, type Delayed } from "@colyseus/core";
import { Player, WorldState } from "../schema/WorldState";
import { randomUUID } from "node:crypto";
import { NameTakenError, type Store, type Trainer } from "../store/types";
import type { FileStore } from "../store/file-store";
import { localAuth, type AuthProvider } from "../auth";
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
  PVP_TURN_MS,
  SOCIAL_RANGE,
  SOCIAL_REQUEST_MS,
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
  type SocialKind,
  type SocialRequestMessage,
  type TradeEndMessage,
  type TradeStateMessage,
} from "../../../shared/constants";
import {
  autoPvpAction,
  forSlot,
  isValidPvpAction,
  otherSlot,
  pvpActive,
  pvpWaitingOn,
  resolvePvpTurn,
  startPvp,
  type PvpAction,
  type PvpSlot,
  type PvpState,
} from "../../../shared/battle/pvp";
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
  type Creature,
  type PvpEndReason,
} from "../../../shared/battle/engine";

interface JoinOptions {
  // modo local
  mode?: unknown;
  name?: unknown;
  password?: unknown;
  starter?: unknown;
  look?: unknown;
  // modo Supabase
  token?: unknown;
  create?: { name?: unknown; look?: unknown; starter?: unknown };
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
  /** batalha amistosa contra outro jogador */
  duel: Duel | null;
  /** troca em andamento */
  trade: Trade | null;
  lastSocialAt: number;
  lastLookAt: number;
}

/** Batalha entre dois jogadores (as sessões nos lugares 0 e 1). */
interface Duel {
  ids: [string, string];
  state: PvpState;
  actions: Partial<Record<PvpSlot, PvpAction>>;
  /** turnos seguidos em que cada um deixou o tempo acabar */
  missed: [number, number];
  timer: Delayed | null;
}

/** Troca entre dois jogadores: cada um oferece uma criatura e os dois confirmam. */
interface Trade {
  ids: [string, string];
  offers: [string | null, string | null];
  ok: [boolean, boolean];
}

/** Pedido de batalha/troca esperando resposta. */
interface SocialPending {
  from: string;
  to: string;
  kind: SocialKind;
  expires: number;
}

const PLAYER_COLORS = [0xe4572e, 0x17bebb, 0xffc914, 0x76b041, 0x9b5de5, 0xf15bb5, 0x00bbf9, 0xfee440];

/** Contas conectadas em qualquer sala deste processo (impede login duplo). */
const ONLINE = new Set<string>();
/** Onde cada conta está conectada (para derrubar a conexão velha quando entra de novo). */
const CONNECTED = new Map<string, Client>();
/** Código de saída quando a mesma conta entra em outro lugar (o cliente não tenta reconectar). */
export const KICKED_ELSEWHERE = 4001;
/** Treinadores carregados na memória (inclui quem acabou de sair e ainda está sendo salvo). */
const LOADED = new Map<string, Trainer>();

function newTrainer(id: string, name: string, look: unknown, starterRaw: unknown): Trainer {
  const starter = isSpeciesId(starterRaw) && STARTERS.includes(starterRaw) ? starterRaw : STARTERS[0];
  const first = createCreature(starter, STARTER_LEVEL);
  first.caughtBy = id;
  first.caughtAt = Date.now();
  first.caughtZone = "Vila Broto";
  return {
    id,
    name,
    look: sanitizeLook(look),
    x: SPAWN.x,
    y: SPAWN.y,
    dir: "down",
    money: STARTING_MONEY,
    bag: { ...STARTING_BAG },
    team: [first],
    box: [],
    dex: { seen: [starter], caught: [starter] },
    stats: { wins: 0, caught: 0 },
    badges: [],
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
}

/**
 * Golpes que mudaram de lugar no aprendizado: criaturas antigas trocam pelo golpe novo.
 * (Aquari aprendia Mordida Firme, igual ao Pawly; agora aprende Bolhas.)
 */
const MOVE_SWAPS: { species: string[]; from: string; to: string }[] = [
  { species: ["aquari", "aquarel", "aquarion"], from: "mordida_firme", to: "bolhas" },
];
function migrateMoves(t: Trainer): boolean {
  let changed = false;
  for (const c of [...t.team, ...t.box]) {
    for (const swap of MOVE_SWAPS) {
      const i = c.moves.indexOf(swap.from);
      if (!swap.species.includes(c.speciesId) || i < 0) continue;
      if (c.moves.includes(swap.to)) c.moves.splice(i, 1);
      else c.moves[i] = swap.to;
      changed = true;
    }
  }
  return changed;
}

function cleanName(raw: unknown): string {
  const base = typeof raw === "string" ? raw : "";
  return base.replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX_LENGTH);
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  /** Armazenamento compartilhado por todas as salas (definido ao iniciar o servidor). */
  static store: Store;
  /** Contas do modo local (nome + senha); só existe sem Supabase. */
  static local: FileStore | null = null;
  static auth: AuthProvider = localAuth;
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
    this.clock.setInterval(() => { for (const s of this.sessions.values()) this.store.markDirty(s.trainer); }, 15000);

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
    this.onMessage("social_request", (client, m: unknown) => this.handleSocialRequest(client, m));
    this.onMessage("social_answer", (client, m: unknown) => this.handleSocialAnswer(client, m));
    this.onMessage("trade_offer", (client, m: unknown) => this.handleTradeOffer(client, m));
    this.onMessage("trade_confirm", (client) => this.handleTradeConfirm(client));
    this.onMessage("trade_cancel", (client) => this.endTrade(client.sessionId, "cancel"));
    this.onMessage("set_look", (client, m: unknown) => this.handleSetLook(client, m));
    this.onMessage("*", () => {});
  }

  // ---------- Conta ----------

  async onAuth(_client: Client, options: JoinOptions = {}) {
    const trainer = WorldRoom.auth.mode === "supabase" ? await this.authSupabase(options) : await this.authLocal(options);
    if (ONLINE.has(trainer.id)) {
      // Entrou de novo (recarregou a página, a conexão do celular caiu, outra aba):
      // a conexão nova vale e a antiga é encerrada.
      CONNECTED.get(trainer.id)?.leave(KICKED_ELSEWHERE, "Você entrou em outro lugar.");
      const until = Date.now() + 4000;
      while (ONLINE.has(trainer.id) && Date.now() < until) await new Promise((r) => setTimeout(r, 40));
      if (ONLINE.has(trainer.id)) throw new ServerError(409, "Essa conta já está conectada em outra janela. Tente de novo.");
    }
    return trainer;
  }

  /** Login por e-mail (Supabase): o token vem do navegador. */
  private async authSupabase(options: JoinOptions): Promise<Trainer> {
    const user = await WorldRoom.auth.verify(options.token);
    const loaded = LOADED.get(user.id) ?? (await this.store.get(user.id));
    if (loaded) return loaded;
    // conta nova: precisa criar o personagem
    const create = options.create;
    if (!create || typeof create !== "object") throw new ServerError(404, "SEM_PERSONAGEM");
    const name = cleanName(create.name);
    if (name.length < 2) throw new ServerError(400, "Escolha um nome com pelo menos 2 letras.");
    if (await this.store.nameTaken(name)) throw new ServerError(409, "Esse nome já está em uso. Escolha outro.");
    const t = newTrainer(user.id, name, create.look, create.starter);
    try {
      await this.store.insert(t);
    } catch (err) {
      if (err instanceof NameTakenError) throw new ServerError(409, err.message);
      throw err;
    }
    return t;
  }

  /** Login local (desenvolvimento): nome de treinador + senha no arquivo. */
  private async authLocal(options: JoinOptions): Promise<Trainer> {
    const local = WorldRoom.local;
    if (!local) throw new ServerError(500, "Login local indisponível.");
    const name = cleanName(options.name);
    const password = typeof options.password === "string" ? options.password : "";
    if (name.length < 2) throw new ServerError(400, "Escolha um nome com pelo menos 2 letras.");
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new ServerError(400, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
    }

    if (options.mode === "register") {
      if (await local.nameTaken(name)) throw new ServerError(409, "Esse nome já está em uso. Escolha outro.");
      const t = newTrainer(randomUUID(), name, options.look, options.starter);
      await local.insert(t);
      local.setPassword(t.id, password);
      return t;
    }

    const t = local.findByName(name);
    if (!t || !local.checkPassword(t.id, password)) throw new ServerError(401, "Nome ou senha incorretos.");
    if (options.look !== undefined && !ONLINE.has(t.id)) t.look = sanitizeLook(options.look);
    return t;
  }

  onJoin(client: Client, _options: JoinOptions, trainer: Trainer) {
    if (migrateMoves(trainer)) this.store.markDirty(trainer);
    ONLINE.add(trainer.id);
    CONNECTED.set(trainer.id, client);
    LOADED.set(trainer.id, trainer);
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
      duel: null,
      trade: null,
      lastSocialAt: 0,
      lastLookAt: 0,
    });
    trainer.lastSeen = Date.now();
    this.sendProfile(client);
    this.broadcastSystem(`${trainer.name} chegou à Vila Broto.`);
  }

  onLeave(client: Client) {
    this.leaveSocial(client.sessionId);
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
      if (CONNECTED.get(s.trainer.id) === client) CONNECTED.delete(s.trainer.id);
      // grava já e só então solta da memória (se não voltou nesse meio tempo)
      const t = s.trainer;
      void this.store
        .save(t)
        .catch((err) => {
          console.error(`[store] falha ao salvar ${t.name} na saída:`, err);
          this.store.markDirty(t);
        })
        .finally(() => {
          if (!ONLINE.has(t.id)) LOADED.delete(t.id);
        });
    }
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    if (player) this.broadcastSystem(`${player.name} saiu.`);
  }

  onDispose() {
    void this.store?.flush();
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

    if (s.battle || s.duel || s.trade) return ack(); // em batalha ou troca não anda

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
    if (this.sessions.get(client.sessionId)?.duel) return this.handleDuelAction(client, message);
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
        caught.caughtBy = t.id;
        caught.caughtAt = Date.now();
        caught.caughtZone = s.battleZone;
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
      this.store.markDirty(t);
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
    if (!r || r.s.battle || r.s.duel || r.s.trade) return;
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
      this.store.markDirty(t);
      this.sendProfile(client);
    };
  }

  // ---------- Vila: interações ----------

  private handleInteract(client: Client) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.duel || r.s.trade) return;
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
        this.store.markDirty(s.trainer);
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
    this.store.markDirty(t);
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
    this.store.markDirty(t);
    this.sendProfile(client);
    this.notice(client, `${getSpecies(c.speciesId).name} recuperou Vida.`);
  }

  private handleTeamOrder(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.duel || r.s.trade) return;
    const m = message as { from?: unknown; to?: unknown } | null;
    const team = r.s.trainer.team;
    const from = Number(m?.from);
    const to = Number(m?.to);
    const ok = (n: number) => Number.isInteger(n) && n >= 0 && n < team.length;
    if (!ok(from) || !ok(to) || from === to) return;
    const [c] = team.splice(from, 1);
    team.splice(to, 0, c);
    this.store.markDirty(r.s.trainer);
    this.sendProfile(client);
  }

  private handleBox(client: Client, message: unknown, op: "deposit" | "withdraw") {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.duel || r.s.trade) return;
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
    this.store.markDirty(t);
    this.sendProfile(client);
  }

  // ---------- Visual ----------

  private handleSetLook(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.duel) return;
    const now = Date.now();
    if (now - r.s.lastLookAt < 1000) return;
    r.s.lastLookAt = now;
    const look = sanitizeLook((message as { look?: unknown } | null)?.look);
    r.s.trainer.look = look;
    r.player.look = look;
    this.store.markDirty(r.s.trainer);
  }

  // ---------- Entre jogadores: pedidos ----------

  private pending: SocialPending[] = [];

  private clientOf(sessionId: string) {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  /** Livre para batalhar/trocar: conectado, fora de batalha, troca ou ginásio. */
  private isFree(sessionId: string) {
    const s = this.sessions.get(sessionId);
    const p = this.state.players.get(sessionId);
    return !!s && !!p && !s.battle && !s.duel && !s.trade && !p.inBattle;
  }

  private distance(a: string, b: string) {
    const pa = this.state.players.get(a);
    const pb = this.state.players.get(b);
    if (!pa || !pb) return Infinity;
    return Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
  }

  private handleSocialRequest(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r) return;
    const m = message as { target?: unknown; kind?: unknown } | null;
    const target = typeof m?.target === "string" ? m.target : "";
    const kind = m?.kind === "battle" || m?.kind === "trade" ? m.kind : null;
    if (!kind || target === client.sessionId) return;
    const now = Date.now();
    if (now - r.s.lastSocialAt < 1500) return;
    r.s.lastSocialAt = now;
    const other = this.state.players.get(target);
    const otherClient = this.clientOf(target);
    if (!other || !otherClient) return this.notice(client, "Esse treinador não está mais aqui.");
    if (!this.isFree(client.sessionId)) return this.notice(client, "Termine o que está fazendo antes.");
    if (!this.isFree(target)) return this.notice(client, `${other.name} está ocupado agora.`);
    if (this.distance(client.sessionId, target) > SOCIAL_RANGE) return this.notice(client, `Chegue mais perto de ${other.name}.`);
    if (kind === "trade" && r.s.trainer.team.length + r.s.trainer.box.length < 1) return;

    this.pending = this.pending.filter((p) => p.expires > now && !(p.from === client.sessionId && p.to === target));
    this.pending.push({ from: client.sessionId, to: target, kind, expires: now + SOCIAL_REQUEST_MS });
    const msg: SocialRequestMessage = { from: client.sessionId, name: r.player.name, kind };
    otherClient.send("social_request", msg);
    this.notice(client, kind === "battle" ? `Desafio enviado para ${other.name}.` : `Proposta de troca enviada para ${other.name}.`);
  }

  private handleSocialAnswer(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r) return;
    const m = message as { from?: unknown; accept?: unknown } | null;
    const from = typeof m?.from === "string" ? m.from : "";
    const now = Date.now();
    const req = this.pending.find((p) => p.from === from && p.to === client.sessionId && p.expires > now);
    this.pending = this.pending.filter((p) => p !== req && p.expires > now);
    const fromClient = this.clientOf(from);
    const fromPlayer = this.state.players.get(from);
    if (!req || !fromClient || !fromPlayer) {
      if (m?.accept === true) this.notice(client, "Esse pedido não vale mais.");
      return;
    }
    const what = req.kind === "battle" ? "batalha" : "troca";
    if (m?.accept !== true) return this.notice(fromClient, `${r.player.name} recusou a ${what}.`);
    if (!this.isFree(from) || !this.isFree(client.sessionId)) return this.notice(client, "Um de vocês está ocupado agora.");
    if (this.distance(from, client.sessionId) > SOCIAL_RANGE + 2) {
      this.notice(client, `${fromPlayer.name} se afastou.`);
      return this.notice(fromClient, `${r.player.name} aceitou, mas vocês estão longe demais.`);
    }
    if (req.kind === "battle") this.startDuel(from, client.sessionId);
    else this.startTrade(from, client.sessionId);
  }

  /** Saiu do jogo: perde a batalha amistosa, cancela troca e pedidos. */
  private leaveSocial(sessionId: string) {
    this.pending = this.pending.filter((p) => p.from !== sessionId && p.to !== sessionId);
    const s = this.sessions.get(sessionId);
    if (s?.duel) {
      const d = s.duel;
      const slot = d.ids.indexOf(sessionId) as PvpSlot;
      this.finishDuel(d, otherSlot(slot), "left");
    }
    if (s?.trade) this.endTrade(sessionId, "left");
  }

  // ---------- Batalha amistosa ----------

  private startDuel(a: string, b: string) {
    const sa = this.sessions.get(a)!;
    const sb = this.sessions.get(b)!;
    const duel: Duel = {
      ids: [a, b],
      state: startPvp(sa.trainer.team, sb.trainer.team),
      actions: {},
      missed: [0, 0],
      timer: null,
    };
    sa.duel = duel;
    sb.duel = duel;
    for (const slot of [0, 1] as PvpSlot[]) {
      const me = duel.ids[slot];
      const opp = duel.ids[otherSlot(slot)];
      const player = this.state.players.get(me)!;
      player.inBattle = true;
      const oppPlayer = this.state.players.get(opp)!;
      const side = duel.state.sides[slot];
      const oppSide = duel.state.sides[otherSlot(slot)];
      const msg: BattleStartMessage = {
        wild: false,
        pvp: true,
        trainer: { name: oppPlayer.name, title: "Treinador", look: oppPlayer.look },
        foeCount: oppSide.team.length,
        team: side.team.map((c) => toView(c)),
        active: side.active,
        foe: toView(pvpActive(duel.state, otherSlot(slot)), false),
        zone: "Batalha amistosa",
      };
      this.clientOf(me)?.send("battle_start", msg);
    }
    this.armDuelTimer(duel);
  }

  private armDuelTimer(duel: Duel) {
    duel.timer?.clear();
    duel.timer = this.clock.setTimeout(() => this.duelTimeout(duel), PVP_TURN_MS);
  }

  private duelTimeout(duel: Duel) {
    if (duel.state.result) return;
    for (const slot of pvpWaitingOn(duel.state)) {
      if (duel.actions[slot]) {
        duel.missed[slot] = 0;
        continue;
      }
      duel.missed[slot] += 1;
      if (duel.missed[slot] >= 2) return this.finishDuel(duel, otherSlot(slot), "timeout");
      duel.actions[slot] = autoPvpAction(duel.state, slot);
      const c = this.clientOf(duel.ids[slot]);
      if (c) this.notice(c, "O tempo acabou: escolhemos por você.");
    }
    this.resolveDuel(duel);
  }

  private handleDuelAction(client: Client, message: unknown) {
    const s = this.sessions.get(client.sessionId);
    const duel = s?.duel;
    if (!s || !duel || duel.state.result) return;
    const slot = duel.ids.indexOf(client.sessionId) as PvpSlot;
    // sem intervalo mínimo aqui: cada lado só registra uma ação por turno
    if ((message as { kind?: unknown } | null)?.kind === "run") return this.finishDuel(duel, otherSlot(slot), "forfeit");
    if (!isValidPvpAction(duel.state, slot, message) || duel.actions[slot]) return;
    duel.actions[slot] = message;
    duel.missed[slot] = 0;
    if (pvpWaitingOn(duel.state).every((w) => duel.actions[w])) this.resolveDuel(duel);
  }

  private resolveDuel(duel: Duel) {
    const events = resolvePvpTurn(duel.state, duel.actions, this.rng);
    duel.actions = {};
    if (duel.state.result) {
      const w = duel.state.result.winner;
      return this.finishDuel(duel, w, "ko", events);
    }
    for (const slot of [0, 1] as PvpSlot[]) this.sendDuelTurn(duel, slot, forSlot(events, slot), false);
    this.armDuelTimer(duel);
  }

  private sendDuelTurn(duel: Duel, slot: PvpSlot, events: BattleEvent[], over: boolean) {
    const side = duel.state.sides[slot];
    const oppName = this.state.players.get(duel.ids[otherSlot(slot)])?.name ?? "O adversário";
    const waitingOn = pvpWaitingOn(duel.state);
    const msg: BattleTurnMessage = {
      events,
      team: side.team.map((c) => toView(c)),
      active: side.active,
      foe: toView(pvpActive(duel.state, otherSlot(slot)), false),
      over,
      needSwitch: !over && side.needSwitch,
      bag: {},
      waiting: !over && !waitingOn.includes(slot) ? `Esperando ${oppName} escolher a próxima criatura...` : undefined,
    };
    this.clientOf(duel.ids[slot])?.send("battle_turn", msg);
  }

  /** Fim da batalha amistosa. winner null = empate. Nada muda nos times de verdade. */
  private finishDuel(duel: Duel, winner: PvpSlot | null, reason: PvpEndReason, events: ReturnType<typeof resolvePvpTurn> = []) {
    if (duel.timer) duel.timer.clear();
    duel.timer = null;
    duel.state.result ??= { winner };
    const names = duel.ids.map((id) => this.state.players.get(id)?.name ?? "Alguém") as [string, string];
    for (const slot of [0, 1] as PvpSlot[]) {
      const id = duel.ids[slot];
      const s = this.sessions.get(id);
      if (s) s.duel = null;
      const player = this.state.players.get(id);
      if (player) player.inBattle = false;
      if (reason === "left" && slot !== winner) continue; // quem saiu não recebe nada
      const outcome = winner === null ? "draw" : winner === slot ? "win" : "lose";
      const view = forSlot(events, slot);
      view.push({ t: "pvp_result", outcome, reason, opponent: names[otherSlot(slot)] });
      view.push({ t: "end", result: outcome === "win" ? "win" : outcome === "lose" ? "lose" : "ran" });
      this.sendDuelTurn(duel, slot, view, true);
    }
    if (winner === null) this.broadcastSystem(`${names[0]} e ${names[1]} empataram numa batalha amistosa.`);
    else {
      const how = reason === "forfeit" ? " (desistência)" : reason === "left" ? " (o outro saiu)" : reason === "timeout" ? " (tempo esgotado)" : "";
      this.broadcastSystem(`${names[winner]} venceu ${names[otherSlot(winner)]} numa batalha amistosa${how}!`);
    }
  }

  // ---------- Troca ----------

  private startTrade(a: string, b: string) {
    const trade: Trade = { ids: [a, b], offers: [null, null], ok: [false, false] };
    this.sessions.get(a)!.trade = trade;
    this.sessions.get(b)!.trade = trade;
    this.sendTradeState(trade);
  }

  private findCreature(t: Trainer, uid: string | null): Creature | undefined {
    if (!uid) return undefined;
    return t.team.find((c) => c.uid === uid) ?? t.box.find((c) => c.uid === uid);
  }

  private catcherName(c: Creature, owner: Trainer): string | null {
    if (!c.caughtBy) return null;
    if (c.caughtBy === owner.id) return owner.name;
    return LOADED.get(c.caughtBy)?.name ?? null;
  }

  private sendTradeState(trade: Trade) {
    for (const slot of [0, 1] as PvpSlot[]) {
      const me = this.sessions.get(trade.ids[slot]);
      const them = this.sessions.get(trade.ids[otherSlot(slot)]);
      if (!me || !them) continue;
      const mine = this.findCreature(me.trainer, trade.offers[slot]);
      const theirs = this.findCreature(them.trainer, trade.offers[otherSlot(slot)]);
      const msg: TradeStateMessage = {
        partner: them.trainer.name,
        mine: mine ? toView(mine) : null,
        theirs: theirs ? toView(theirs) : null,
        theirsCaughtBy: theirs ? this.catcherName(theirs, them.trainer) : null,
        myOk: trade.ok[slot],
        theirOk: trade.ok[otherSlot(slot)],
      };
      this.clientOf(trade.ids[slot])?.send("trade_state", msg);
    }
  }

  private handleTradeOffer(client: Client, message: unknown) {
    const s = this.sessions.get(client.sessionId);
    const trade = s?.trade;
    if (!s || !trade) return;
    const raw = (message as { uid?: unknown } | null)?.uid;
    const uid = typeof raw === "string" ? raw : null;
    if (uid && !this.findCreature(s.trainer, uid)) return;
    const slot = trade.ids.indexOf(client.sessionId) as PvpSlot;
    trade.offers[slot] = uid;
    // qualquer mudança desfaz as confirmações
    trade.ok = [false, false];
    this.sendTradeState(trade);
  }

  private handleTradeConfirm(client: Client) {
    const s = this.sessions.get(client.sessionId);
    const trade = s?.trade;
    if (!s || !trade || !trade.offers[0] || !trade.offers[1]) return;
    const slot = trade.ids.indexOf(client.sessionId) as PvpSlot;
    trade.ok[slot] = true;
    if (trade.ok[0] && trade.ok[1]) this.executeTrade(trade);
    else this.sendTradeState(trade);
  }

  private executeTrade(trade: Trade) {
    const [sa, sb] = trade.ids.map((id) => this.sessions.get(id));
    if (!sa || !sb) return;
    const ca = this.findCreature(sa.trainer, trade.offers[0]);
    const cb = this.findCreature(sb.trainer, trade.offers[1]);
    if (!ca || !cb) return this.endTrade(trade.ids[0], "cancel");
    const take = (t: Trainer, c: Creature) => {
      t.team = t.team.filter((x) => x !== c);
      t.box = t.box.filter((x) => x !== c);
    };
    const give = (t: Trainer, c: Creature) => {
      if (t.team.length < TEAM_MAX) t.team.push(c);
      else t.box.push(c);
      if (!t.dex.seen.includes(c.speciesId)) t.dex.seen.push(c.speciesId);
      if (!t.dex.caught.includes(c.speciesId)) t.dex.caught.push(c.speciesId);
    };
    take(sa.trainer, ca);
    take(sb.trainer, cb);
    give(sa.trainer, cb);
    give(sb.trainer, ca);
    // ninguém fica sem time
    for (const t of [sa.trainer, sb.trainer]) if (!t.team.length && t.box.length) t.team.push(t.box.shift()!);
    for (const t of [sa.trainer, sb.trainer]) {
      t.lastSeen = Date.now();
      void this.store.save(t).catch(() => this.store.markDirty(t));
    }
    sa.trade = null;
    sb.trade = null;
    const nameA = getSpecies(ca.speciesId).name;
    const nameB = getSpecies(cb.speciesId).name;
    const send = (id: string, text: string) => {
      const c = this.clientOf(id);
      if (!c) return;
      const msg: TradeEndMessage = { done: true, text };
      c.send("trade_end", msg);
      this.sendProfile(c);
    };
    send(trade.ids[0], `Troca feita! ${nameA} foi para ${sb.trainer.name} e você recebeu ${nameB}.`);
    send(trade.ids[1], `Troca feita! ${nameB} foi para ${sa.trainer.name} e você recebeu ${nameA}.`);
    this.broadcastSystem(`${sa.trainer.name} e ${sb.trainer.name} trocaram ${nameA} por ${nameB}.`);
  }

  private endTrade(sessionId: string, why: "cancel" | "left") {
    const s = this.sessions.get(sessionId);
    const trade = s?.trade;
    if (!s || !trade) return;
    const who = s.trainer.name;
    for (const id of trade.ids) {
      const other = this.sessions.get(id);
      if (other) other.trade = null;
      if (id === sessionId) continue;
      const c = this.clientOf(id);
      const msg: TradeEndMessage = { done: false, text: why === "left" ? `${who} saiu do jogo. Troca cancelada.` : `${who} cancelou a troca.` };
      c?.send("trade_end", msg);
    }
    const self = this.clientOf(sessionId);
    if (self && why === "cancel") {
      const msg: TradeEndMessage = { done: false, text: "Troca cancelada." };
      self.send("trade_end", msg);
    }
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
