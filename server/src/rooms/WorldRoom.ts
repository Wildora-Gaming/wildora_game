import { Room, Client, ServerError, type Delayed } from "@colyseus/core";
import { Player, WorldState } from "../schema/WorldState";
import { randomUUID } from "node:crypto";
import { NameTakenError, type Listing, type Store, type Trainer } from "../store/types";
import type { FileStore } from "../store/file-store";
import { localAuth, type AuthProvider } from "../auth";
import {
  BATTLE_ACTION_COOLDOWN_MS,
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  DIRECTION_DELTA,
  ENCOUNTER_CHANCE,
  LEGEND_DURATION_MS,
  LEGEND_FIRST_MS,
  LEGEND_INTERVAL_MS,
  LEGEND_LEVEL,
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
import { HEAL_POINT, LEGEND_SPOTS, SPAWN, WORLD_VERSION, doorOf, isWalkable, isWildTile, objectAt, tileAt } from "../../../shared/map";
import { areaName, rollWildAt } from "../../../shared/creatures";
import { getGym, gymStages, type Gym } from "../../../shared/gyms";
import { tutorOption } from "../../../shared/tutor";
import {
  MARKET_FEE,
  MARKET_MAX_PER_SELLER,
  MARKET_MAX_PRICE,
  MERCHANT_STAY_MS,
  MERCHANT_STOCK,
  creatureSellPrice,
  itemSellPrice,
} from "../../../shared/economy";
import { MERCHANT, MERCHANT_SPOTS, NPCS, dayNumber, getNpc, roadReward, type Npc, type QuestTask } from "../../../shared/npcs";
import { TYPE_LABEL } from "../../../shared/battle/types";
import { sanitizeLook } from "../../../shared/avatar/look";
import { STARTERS, STARTER_LEVEL, getMove, getSpecies, isSpeciesId } from "../../../shared/battle/data";
import { SHOP_ITEMS, candyChance, STARTING_BAG, STARTING_MONEY, getItem, moneyReward } from "../../../shared/items";
import {
  activeOf,
  awardExperience,
  calcStats,
  chooseTrainerAction,
  chooseWildAction,
  createCreature,
  evolveIfReady,
  gainXp,
  healFully,
  maxLevelOf,
  MAX_MOVES,
  xpForLevel,
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
  /** a batalha atual é contra o lendário do evento */
  legendBattle: boolean;
  /** batalha contra um treinador da estrada (id do NPC) */
  road: string | null;
  /** treinadores da estrada que já desafiaram nesta conexão (não insistem logo de novo) */
  roadSeen: Map<string, number>;
}

/** Lendário do evento (o estado público fica em state.legend). */
interface LegendEvent {
  creature: Creature;
  region: string;
  /** sessão que está batalhando com ele */
  busyBy: string | null;
  /** o tempo acabou durante uma batalha: some quando ela terminar */
  expired: boolean;
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
    world: WORLD_VERSION,
  };
}

/**
 * Golpes que mudaram no aprendizado: criaturas já salvas trocam pelo golpe novo ao entrar.
 * - Investida (igual para todos) virou o golpe básico próprio de cada espécie.
 * - Aquari: Mordida Firme (do Pawly) virou Bolhas.
 * - Zebri: Mordida Firme e Golpe Bruto (do Pawly) viraram Galope e Pisoteio.
 */
const MOVE_SWAPS: Record<string, Record<string, string>> = {
  aquari: { mordida_firme: "bolhas" },
  aquarel: { mordida_firme: "bolhas" },
  aquarion: { mordida_firme: "bolhas" },
  zebri: { mordida_firme: "galope", golpe_bruto: "pisoteio" },
};
function migrateMoves(t: Trainer): boolean {
  let changed = false;
  for (const c of [...t.team, ...t.box]) {
    const species = getSpecies(c.speciesId);
    const swaps: Record<string, string> = { ...(MOVE_SWAPS[c.speciesId] ?? {}) };
    const basic = species.learnset[0]?.[1];
    if (basic && basic !== "investida" && !species.learnset.some(([, id]) => id === "investida")) swaps.investida = basic;
    const next: string[] = [];
    for (const id of c.moves) {
      const to = swaps[id] ?? id;
      if (to !== id) changed = true;
      if (!next.includes(to)) next.push(to);
    }
    c.moves = next;
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
    this.scheduleLegend(LEGEND_FIRST_MS);
    this.marketReady = this.store.marketAll().then((list) => {
      for (const l of list) this.market.set(l.id, l);
    }).catch((err) => console.error("[mercado] falha ao carregar:", err));
    this.moveMerchant(false);
    // salvamento periódico das posições
    this.clock.setInterval(() => { for (const s of this.sessions.values()) this.store.markDirty(s.trainer); }, 15000);

    this.onMessage("move", (client, m: unknown) => this.handleMove(client, m));
    this.onMessage("chat", (client, m: unknown) => this.handleChat(client, m));
    this.onMessage("battle_action", (client, m: unknown) => this.handleBattleAction(client, m));
    this.onMessage("interact", (client) => this.handleInteract(client));
    this.onMessage("buy", (client, m: unknown) => this.handleBuy(client, m));
    this.onMessage("sell_item", (client, m: unknown) => this.handleSellItem(client, m));
    this.onMessage("npc_swap", (client, m: unknown) => this.handleNpcSwap(client, m));
    this.onMessage("market_open", (client) => this.handleMarketOpen(client));
    this.onMessage("market_list", (client, m: unknown) => void this.handleMarketList(client, m));
    this.onMessage("market_buy", (client, m: unknown) => void this.handleMarketBuy(client, m));
    this.onMessage("market_cancel", (client, m: unknown) => void this.handleMarketCancel(client, m));
    this.onMessage("sell_creature", (client, m: unknown) => this.handleSellCreature(client, m));
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
    this.onMessage("tutor_teach", (client, m: unknown) => this.handleTutorTeach(client, m));
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
    if ((trainer.world ?? 1) < WORLD_VERSION) {
      // o mundo mudou desde o último jogo: volta para a Vila Broto
      trainer.x = SPAWN.x;
      trainer.y = SPAWN.y;
      trainer.world = WORLD_VERSION;
      this.store.markDirty(trainer);
    }
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
      legendBattle: false,
      road: null,
      roadSeen: new Map(),
    });
    trainer.lastSeen = Date.now();
    trainer.progress ??= {};
    this.sendProfile(client);
    void this.marketReady.then(() => this.collectSales(trainer));
    this.broadcastSystem(`${trainer.name} chegou à Vila Broto.`);
  }

  onLeave(client: Client) {
    this.leaveSocial(client.sessionId);
    if (this.legend?.busyBy === client.sessionId) this.releaseLegend();
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
    const player = this.state.players.get(client.sessionId);
    if (player) player.pet = t.team[0]?.speciesId ?? "";
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
    const mc = this.state.merchant;
    if (mc.x && mc.x === nx && mc.y === ny) {
      // andar contra o Mercador abre a barraca
      ack();
      return this.openMerchant(client, s);
    }
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

    if (this.roadChallenge(client, player, s)) return;

    const legend = this.state.legend;
    if (this.legend && legend.speciesId && legend.x === nx && legend.y === ny) {
      if (this.legend.busyBy) {
        const other = this.state.players.get(this.legend.busyBy)?.name ?? "Outro treinador";
        this.notice(client, `${other} já está enfrentando ${getSpecies(legend.speciesId).name}. Espere a vez!`);
        return;
      }
      this.legend.busyBy = client.sessionId;
      legend.busy = true;
      s.legendBattle = true;
      this.beginWildBattle(client, player, s, this.legend.creature, this.legend.region);
      return;
    }

    if (isWildTile(tileAt(nx, ny)) && this.rng() < ENCOUNTER_CHANCE) {
      const { zone, speciesId, level } = rollWildAt(nx, ny, this.rng, this.state.night);
      this.beginWildBattle(client, player, s, createCreature(speciesId, level), zone.name);
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
    const foeAction = battle.wild ? chooseWildAction(battle, this.rng) : chooseTrainerAction(battle, this.rng, stage?.smart ?? 0.6);
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
      const roadNpc = s.road ? getNpc(s.road) : undefined;
      const money = stage ? stage.reward : roadNpc ? roadReward(roadNpc) : moneyReward(battle.foe.level);
      t.money += money;
      events.push({ t: "money", amount: money });
      // vencer criatura selvagem pode deixar um Doce Estelar
      if (battle.wild && battle.result === "win") {
        if (this.rng() < candyChance(battle.foe.level)) {
          t.bag.doce_estelar = (t.bag.doce_estelar ?? 0) + 1;
          events.push({ t: "found", itemId: "doce_estelar" });
        }
      }
      events.push(end);
      if (s.gymRun && battle.result === "win") next = this.advanceGym(client, player, s);
    } else if (battle.result === "lose") {
      s.gymRun = null;
      s.road = null;
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
      // missões e treinadores da estrada
      if (battle.wild && !s.legendBattle && (battle.result === "win" || battle.result === "caught")) {
        this.questEvent(client, t, { kind: battle.result === "caught" ? "catch" : "win", species: battle.foe.speciesId, zone: s.battleZone });
      }
      if (s.road && battle.result === "win") {
        const npc = getNpc(s.road)!;
        (t.progress!.roadWins ??= {})[npc.id] = dayNumber(Date.now());
        this.questEvent(client, t, { kind: "road" });
        this.notice(client, `${npc.name}: Boa batalha! Amanhã quero revanche.`);
      }
      s.road = null;
      if (s.legendBattle) {
        s.legendBattle = false;
        const name = getSpecies(battle.foe.speciesId).name;
        if (battle.result === "caught") {
          this.broadcastSystem(`✦ ${t.name} capturou o lendário ${name}! ✦`);
          this.endLegend();
        } else if (battle.result === "win") {
          this.broadcastSystem(`${t.name} venceu ${name}, que fugiu ferido. Até a próxima aparição!`);
          this.endLegend();
        } else {
          this.releaseLegend();
        }
      }
      this.store.markDirty(t);
      this.sendProfile(client);
      next?.();
    }
  }

  // ---------- Evento dos lendários ----------

  private legend: LegendEvent | null = null;
  private legendTimer: Delayed | null = null;

  /** Agenda o próximo lendário. WILDORA_LEGEND_MS (ms) troca o intervalo, para testar. */
  private scheduleLegend([min, max]: [number, number]) {
    this.legendTimer?.clear();
    const env = Number(process.env.WILDORA_LEGEND_MS);
    const delay = env > 0 ? env : min + Math.floor(this.rng() * (max - min));
    this.legendTimer = this.clock.setTimeout(() => this.spawnLegend(), delay);
  }

  /** Coloca um lendário na clareira do bioma dele e avisa no chat. */
  spawnLegend(speciesId?: string) {
    if (this.legend) return;
    const ids = Object.keys(LEGEND_SPOTS);
    const id = speciesId && LEGEND_SPOTS[speciesId] ? speciesId : ids[Math.floor(this.rng() * ids.length)];
    const spot = LEGEND_SPOTS[id];
    const [lo, hi] = LEGEND_LEVEL;
    const creature = createCreature(id, lo + Math.floor(this.rng() * (hi - lo + 1)));
    this.legend = { creature, region: spot.region, busyBy: null, expired: false };
    const st = this.state.legend;
    st.speciesId = id;
    st.x = spot.x;
    st.y = spot.y;
    st.busy = false;
    st.endsAt = Date.now() + LEGEND_DURATION_MS;
    const minutes = Math.round(LEGEND_DURATION_MS / 60000);
    this.broadcastSystem(
      `✦ Um lendário apareceu! ${getSpecies(id).name} (Nv. ${creature.level}) foi visto ${spot.at}. Ele some em ${minutes} minutos: o primeiro a chegar enfrenta!`,
    );
    this.legendTimer?.clear();
    this.legendTimer = this.clock.setTimeout(() => {
      if (!this.legend) return;
      if (this.legend.busyBy) {
        this.legend.expired = true;
        return;
      }
      this.broadcastSystem(`${getSpecies(id).name} desapareceu ${spot.at.replace(/^n/, "d")}.`);
      this.endLegend();
    }, LEGEND_DURATION_MS);
  }

  /** Batalha com o lendário acabou sem captura nem vitória: fica livre para o próximo (com o dano que levou). */
  private releaseLegend() {
    const ev = this.legend;
    if (!ev) return;
    ev.busyBy = null;
    this.state.legend.busy = false;
    const c = ev.creature;
    c.status = null;
    c.statusTurns = 0;
    if (c.hp <= 0) c.hp = 1;
    if (ev.expired) {
      this.broadcastSystem(`${getSpecies(c.speciesId).name} desapareceu ${LEGEND_SPOTS[c.speciesId].at.replace(/^n/, "d")}.`);
      this.endLegend();
    }
  }

  /** Tira o lendário do mapa e agenda o próximo. */
  private endLegend() {
    this.legend = null;
    const st = this.state.legend;
    st.speciesId = "";
    st.busy = false;
    st.endsAt = 0;
    this.scheduleLegend(LEGEND_INTERVAL_MS);
  }

  // ---------- Personagens do mundo ----------

  private dialog(client: Client, title: string, text: string) {
    const msg: DialogMessage = { title, text };
    client.send("dialog", msg);
  }

  /** Conversa com um NPC (Corretora, troca, missão ou treinador da estrada). */
  private talkTo(client: Client, s: Session, npc: Npc) {
    const t = s.trainer;
    const p = (t.progress ??= {});
    if (npc.role === "market") {
      this.handleMarketOpen(client);
    } else if (npc.role === "swap" && npc.swap) {
      const done = (p.npcTrades ?? []).includes(npc.id);
      const want = getSpecies(npc.swap.want).name;
      const give = getSpecies(npc.swap.give).name;
      if (done) return this.dialog(client, npc.name, `Obrigado de novo pela troca! Cuide bem do ${give}... digo, eu cuido bem do ${want}.`);
      client.send("npc_swap", { npcId: npc.id, name: npc.name, hello: npc.hello, want: npc.swap.want, give: npc.swap.give });
    } else if (npc.role === "quest" && npc.quests) {
      const q = ((p.quests ??= {})[npc.id] ??= { step: -1, count: 0 });
      if (q.step < 0) {
        q.step = 0;
        q.count = 0;
        this.store.markDirty(t);
        return this.dialog(client, npc.name, `${npc.hello} ${npc.quests[0].ask}`);
      }
      const quest = npc.quests[q.step];
      if (!quest) return this.dialog(client, npc.name, "Você já me ajudou com tudo. Obrigada, de verdade!");
      if (q.count < quest.task.count) {
        return this.dialog(client, npc.name, `${quest.ask} (${q.count}/${quest.task.count})`);
      }
      // entrega a recompensa e passa para a próxima
      const gifts: string[] = [];
      if (quest.reward.money) {
        t.money += quest.reward.money;
        gifts.push(`${quest.reward.money} Sementes`);
      }
      for (const [id, n] of Object.entries(quest.reward.items ?? {})) {
        t.bag[id] = (t.bag[id] ?? 0) + n;
        gifts.push(`${n}× ${getItem(id)?.name ?? id}`);
      }
      q.step += 1;
      q.count = 0;
      this.store.markDirty(t);
      this.sendProfile(client);
      const next = npc.quests[q.step];
      this.dialog(client, npc.name, `${quest.thanks} Você recebeu ${gifts.join(", ")}.${next ? ` Próximo pedido: ${next.ask}` : ""}`);
    } else if (npc.role === "road") {
      if (p.roadWins?.[npc.id] === dayNumber(Date.now())) {
        return this.dialog(client, npc.name, "Você já me venceu hoje. Amanhã tem revanche!");
      }
      const player = this.state.players.get(client.sessionId);
      if (player) this.beginRoadBattle(client, player, s, npc);
    }
  }

  /** Conta progresso das missões aceitas. */
  private questEvent(client: Client, t: Trainer, ev: { kind: QuestTask["kind"]; species?: string; zone?: string }) {
    const quests = t.progress?.quests;
    if (!quests) return;
    for (const npc of NPCS) {
      const q = quests[npc.id];
      const quest = q && q.step >= 0 ? npc.quests?.[q.step] : undefined;
      if (!q || !quest || q.count >= quest.task.count) continue;
      const task = quest.task;
      if (task.kind !== ev.kind) continue;
      if ("zone" in task && task.zone && task.zone !== ev.zone) continue;
      if ("species" in task && task.species && task.species !== ev.species) continue;
      q.count += 1;
      this.store.markDirty(t);
      if (q.count >= task.count) this.notice(client, `Missão concluída! Volte para falar com ${npc.name}.`);
    }
  }

  /** Troca com NPC: entrega a criatura pedida e recebe a outra, no mesmo nível. */
  private handleNpcSwap(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.trade || r.s.duel) return;
    const m = message as { npcId?: unknown; uid?: unknown } | null;
    const npc = getNpc(m?.npcId);
    if (!npc?.swap || !this.nearNpc(r.player, npc)) return;
    const t = r.s.trainer;
    const p = (t.progress ??= {});
    if ((p.npcTrades ?? []).includes(npc.id)) return;
    const inTeam = t.team.findIndex((c) => c.uid === m?.uid);
    const inBox = t.box.findIndex((c) => c.uid === m?.uid);
    const list = inTeam >= 0 ? t.team : inBox >= 0 ? t.box : null;
    const index = inTeam >= 0 ? inTeam : inBox;
    if (!list || list[index].speciesId !== npc.swap.want) return;
    const old = list[index];
    const got = createCreature(npc.swap.give, old.level);
    got.caughtBy = t.id;
    got.caughtAt = Date.now();
    got.caughtZone = `Troca com ${npc.name}`;
    list[index] = got;
    for (const k of ["seen", "caught"] as const) if (!t.dex[k].includes(got.speciesId)) t.dex[k].push(got.speciesId);
    (p.npcTrades ??= []).push(npc.id);
    this.store.markDirty(t);
    this.sendProfile(client);
    client.send("npc_swap_done", {});
    this.dialog(client, npc.name, `Muito obrigado! Cuide bem do ${getSpecies(got.speciesId).name} (Nv. ${got.level}).`);
  }

  private nearNpc(player: Player, npc: Npc) {
    return Math.abs(player.x - npc.x) + Math.abs(player.y - npc.y) <= 1;
  }

  /** Treinador da estrada vê o jogador passando perto e desafia (uma vez por dia, se vencer). */
  private roadChallenge(client: Client, player: Player, s: Session): boolean {
    const now = Date.now();
    for (const npc of NPCS) {
      if (npc.role !== "road") continue;
      if (Math.abs(player.x - npc.x) + Math.abs(player.y - npc.y) > 2) continue;
      if (s.trainer.progress?.roadWins?.[npc.id] === dayNumber(now)) continue;
      if (now - (s.roadSeen.get(npc.id) ?? 0) < 3 * 60_000) continue; // perdeu ou fugiu: não insiste logo
      if (!s.trainer.team.some((c) => c.hp > 0)) continue;
      s.roadSeen.set(npc.id, now);
      this.notice(client, `${npc.name}: ${npc.hello}`);
      this.beginRoadBattle(client, player, s, npc);
      return true;
    }
    return false;
  }

  private beginRoadBattle(client: Client, player: Player, s: Session, npc: Npc) {
    if (s.battle || s.duel || s.trade || !npc.team) return;
    const foes = npc.team.map(([species, level]) => createCreature(species, level));
    s.battle = startBattle(s.trainer.team, foes, false);
    s.battleZone = areaName(npc.x, npc.y);
    s.road = npc.id;
    s.roadSeen.set(npc.id, Date.now());
    player.inBattle = true;
    for (const f of foes) if (!s.trainer.dex.seen.includes(f.speciesId)) s.trainer.dex.seen.push(f.speciesId);
    const msg: BattleStartMessage = {
      wild: false,
      trainer: { name: npc.name, title: "Treinador da estrada", look: npc.look },
      foeCount: foes.length,
      team: s.trainer.team.map((c) => toView(c)),
      active: s.battle.active,
      foe: toView(foes[0], false),
      zone: s.battleZone,
    };
    client.send("battle_start", msg);
  }

  // ---------- Mercador viajante ----------

  private merchantTimer: Delayed | null = null;

  /** Muda o Mercador para outro lugar (e avisa no chat). */
  moveMerchant(announce = true) {
    const st = this.state.merchant;
    const options = MERCHANT_SPOTS.filter((sp) => sp.x !== st.x || sp.y !== st.y);
    const spot = options[Math.floor(this.rng() * options.length)];
    st.x = spot.x;
    st.y = spot.y;
    st.region = spot.region;
    st.until = Date.now() + MERCHANT_STAY_MS;
    if (announce) this.broadcastSystem(`${MERCHANT.name}, o mercador viajante, montou a barraca em ${spot.region}.`);
    this.merchantTimer?.clear();
    this.merchantTimer = this.clock.setTimeout(() => this.moveMerchant(), MERCHANT_STAY_MS);
  }

  private openMerchant(client: Client, s: Session) {
    const msg: ShopMessage = {
      shop: "mercador",
      title: `${MERCHANT.name}, mercador viajante`,
      items: MERCHANT_STOCK.map(({ itemId, price }) => {
        const it = getItem(itemId)!;
        return { id: itemId, name: it.name, description: it.description, price };
      }),
      money: s.trainer.money,
    };
    client.send("shop", msg);
  }

  // ---------- Mercado entre jogadores ----------

  private market = new Map<string, Listing>();
  private marketReady: Promise<void> = Promise.resolve();

  private listingView(l: Listing, mine: boolean) {
    return {
      id: l.id,
      seller: l.sellerName,
      price: l.price,
      creature: l.creature ? toView(l.creature) : undefined,
      itemId: l.itemId,
      qty: l.qty,
      mine,
      sold: !!l.soldAt,
    };
  }

  private handleMarketOpen(client: Client) {
    const r = this.ready(client);
    if (!r || !this.nearRole(r.player, "market")) return;
    void this.marketReady.then(() => {
      const me = r.s.trainer.id;
      const open = [...this.market.values()].filter((l) => !l.soldAt);
      client.send("market", {
        listings: open.filter((l) => l.sellerId !== me).map((l) => this.listingView(l, false)),
        mine: open.filter((l) => l.sellerId === me).map((l) => this.listingView(l, true)),
        fee: MARKET_FEE,
        maxPerSeller: MARKET_MAX_PER_SELLER,
      });
    });
  }

  private async handleMarketList(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.trade || r.s.duel || !this.nearRole(r.player, "market")) return;
    await this.marketReady;
    const m = message as { uid?: unknown; itemId?: unknown; qty?: unknown; price?: unknown } | null;
    const t = r.s.trainer;
    const price = Number(m?.price);
    if (!Number.isInteger(price) || price < 1 || price > MARKET_MAX_PRICE) return this.notice(client, "Escolha um preço entre 1 e 999.999 Sementes.");
    const mine = [...this.market.values()].filter((l) => l.sellerId === t.id && !l.soldAt).length;
    if (mine >= MARKET_MAX_PER_SELLER) return this.notice(client, `Você já tem ${MARKET_MAX_PER_SELLER} ofertas no Mercado.`);
    const l: Listing = { id: randomUUID(), sellerId: t.id, sellerName: t.name, price, createdAt: Date.now() };
    let what: string;
    if (typeof m?.uid === "string") {
      const ti = t.team.findIndex((c) => c.uid === m.uid);
      const bi = t.box.findIndex((c) => c.uid === m.uid);
      if (ti < 0 && bi < 0) return;
      if (ti >= 0 && t.team.length <= 1) return this.notice(client, "Você precisa de pelo menos uma criatura no time.");
      const [c] = ti >= 0 ? t.team.splice(ti, 1) : t.box.splice(bi, 1);
      c.status = null;
      c.statusTurns = 0;
      l.creature = c;
      what = `${getSpecies(c.speciesId).name} (Nv. ${c.level})`;
    } else {
      const item = getItem(m?.itemId);
      const qty = Number(m?.qty);
      if (!item || !Number.isInteger(qty) || qty < 1 || qty > 99 || (t.bag[item.id] ?? 0) < qty) return;
      t.bag[item.id] -= qty;
      if (t.bag[item.id] <= 0) delete t.bag[item.id];
      l.itemId = item.id;
      l.qty = qty;
      what = `${qty}× ${item.name}`;
    }
    this.market.set(l.id, l);
    // a oferta é gravada antes do treinador: se cair no meio, nada some
    await this.store.marketPut(l).catch((err) => console.error("[mercado] falha ao gravar oferta:", err));
    await this.store.save(t).catch(() => this.store.markDirty(t));
    this.sendProfile(client);
    this.notice(client, `Oferta publicada: ${what} por ${price} Sementes.`);
    this.handleMarketOpen(client);
  }

  private async handleMarketBuy(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.trade || r.s.duel || !this.nearRole(r.player, "market")) return;
    await this.marketReady;
    const l = this.market.get(String((message as { id?: unknown } | null)?.id));
    const t = r.s.trainer;
    if (!l || l.soldAt || l.sellerId === t.id) return this.handleMarketOpen(client);
    if (t.money < l.price) return this.notice(client, "Sementes insuficientes.");
    t.money -= l.price;
    let what: string;
    if (l.creature) {
      const c = l.creature;
      if (t.team.length < TEAM_MAX) t.team.push(c);
      else t.box.push(c);
      for (const k of ["seen", "caught"] as const) if (!t.dex[k].includes(c.speciesId)) t.dex[k].push(c.speciesId);
      what = `${getSpecies(c.speciesId).name} (Nv. ${c.level})`;
    } else {
      t.bag[l.itemId!] = (t.bag[l.itemId!] ?? 0) + (l.qty ?? 1);
      what = `${l.qty}× ${getItem(l.itemId)?.name ?? l.itemId}`;
    }
    l.soldAt = Date.now();
    l.buyerName = t.name;
    await this.store.marketPut(l).catch((err) => console.error("[mercado] falha ao gravar venda:", err));
    await this.store.save(t).catch(() => this.store.markDirty(t));
    this.sendProfile(client);
    this.notice(client, `Você comprou ${what} de ${l.sellerName} por ${l.price} Sementes.`);
    // vendedor online recebe na hora; offline, recebe ao entrar
    const seller = [...this.sessions.entries()].find(([, ss]) => ss.trainer.id === l.sellerId);
    if (seller) await this.collectSales(seller[1].trainer);
    this.handleMarketOpen(client);
  }

  private async handleMarketCancel(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.trade || r.s.duel || !this.nearRole(r.player, "market")) return;
    await this.marketReady;
    const l = this.market.get(String((message as { id?: unknown } | null)?.id));
    const t = r.s.trainer;
    if (!l || l.soldAt || l.sellerId !== t.id) return;
    if (l.creature) {
      if (t.team.length < TEAM_MAX) t.team.push(l.creature);
      else t.box.push(l.creature);
    } else if (l.itemId) {
      t.bag[l.itemId] = (t.bag[l.itemId] ?? 0) + (l.qty ?? 1);
    }
    this.market.delete(l.id);
    // devolve primeiro ao treinador, depois apaga a oferta
    await this.store.save(t).catch(() => this.store.markDirty(t));
    await this.store.marketDelete(l.id).catch((err) => console.error("[mercado] falha ao apagar oferta:", err));
    this.sendProfile(client);
    this.notice(client, "Oferta retirada; voltou para você.");
    this.handleMarketOpen(client);
  }

  /** Recebe as Sementes das ofertas vendidas (menos a taxa do Mercado). */
  private async collectSales(t: Trainer) {
    const sold = [...this.market.values()].filter((l) => l.sellerId === t.id && l.soldAt);
    if (!sold.length) return;
    let total = 0;
    const lines: string[] = [];
    for (const l of sold) {
      const net = l.price - Math.floor(l.price * MARKET_FEE);
      total += net;
      const what = l.creature ? getSpecies(l.creature.speciesId).name : `${l.qty}× ${getItem(l.itemId)?.name ?? l.itemId}`;
      lines.push(`${what} para ${l.buyerName}`);
      this.market.delete(l.id);
    }
    t.money += total;
    await this.store.save(t).catch(() => this.store.markDirty(t));
    for (const l of sold) await this.store.marketDelete(l.id).catch((err) => console.error("[mercado] falha ao apagar venda:", err));
    const entry = [...this.sessions.entries()].find(([, ss]) => ss.trainer.id === t.id);
    const client = entry ? this.clientOf(entry[0]) : undefined;
    if (client) {
      this.sendProfile(client);
      this.notice(client, `Mercado: você vendeu ${lines.join(", ")} e recebeu ${total} Sementes (taxa de ${Math.round(MARKET_FEE * 100)}%).`);
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
    const mc = this.state.merchant;
    if (mc.x && mc.x === tx && mc.y === ty) return this.openMerchant(client, s);
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
      } else if (obj.role === "tutor") {
        client.send("tutor_open", {});
      } else {
        const msg: ShopMessage = {
          shop: "loja",
          title: "Loja da Vila Broto",
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
    } else if (obj.kind === "npc" && obj.npcId) {
      const npc = getNpc(obj.npcId);
      if (npc) this.talkTo(client, s, npc);
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
    const m = message as { itemId?: unknown; qty?: unknown; shop?: unknown } | null;
    const item = getItem(m?.itemId);
    const qty = Number(m?.qty);
    if (!item || !Number.isInteger(qty) || qty < 1 || qty > 99) return;
    // preço vem da loja onde o jogador está (Loja da vila ou Mercador viajante)
    let unit: number;
    if (m?.shop === "mercador") {
      const offer = MERCHANT_STOCK.find((o) => o.itemId === item.id);
      if (!offer || !this.nearMerchant(r.player)) return;
      unit = offer.price;
    } else {
      if (item.price === null || !SHOP_ITEMS.includes(item.id) || !this.nearShop(r.player)) return;
      unit = item.price;
    }
    const t = r.s.trainer;
    const cost = unit * qty;
    if (t.money < cost) return this.notice(client, "Sementes insuficientes.");
    t.money -= cost;
    t.bag[item.id] = (t.bag[item.id] ?? 0) + qty;
    this.store.markDirty(t);
    this.sendProfile(client);
    this.notice(client, `Você comprou ${qty}× ${item.name}.`);
  }

  /** Vende itens da mochila para a Loja (metade do preço). */
  private handleSellItem(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.trade) return;
    if (!this.nearShop(r.player)) return;
    const m = message as { itemId?: unknown; qty?: unknown } | null;
    const item = getItem(m?.itemId);
    const qty = Number(m?.qty);
    if (!item || !Number.isInteger(qty) || qty < 1 || qty > 99) return;
    const t = r.s.trainer;
    const have = t.bag[item.id] ?? 0;
    const price = itemSellPrice(item.id);
    if (have < qty || price <= 0) return;
    t.bag[item.id] = have - qty;
    if (t.bag[item.id] <= 0) delete t.bag[item.id];
    t.money += price * qty;
    this.store.markDirty(t);
    this.sendProfile(client);
    this.notice(client, `Você vendeu ${qty}× ${item.name} por ${price * qty} Sementes.`);
  }

  /** Vende uma criatura da caixa para a Loja (lendários não). */
  private handleSellCreature(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.trade) return;
    if (!this.nearShop(r.player)) return;
    const t = r.s.trainer;
    const uid = (message as { uid?: unknown } | null)?.uid;
    const index = t.box.findIndex((c) => c.uid === uid);
    if (index < 0) return;
    const c = t.box[index];
    const price = creatureSellPrice(c);
    if (price <= 0) return this.notice(client, "A Loja não compra criaturas lendárias. Tente o Mercado.");
    t.box.splice(index, 1);
    t.money += price;
    this.store.markDirty(t);
    this.sendProfile(client);
    this.notice(client, `Você vendeu ${getSpecies(c.speciesId).name} (Nv. ${c.level}) por ${price} Sementes.`);
  }

  /** Perto do Mercador viajante (definido no evento do Mercador). */
  private nearMerchant(player: Player) {
    const mc = this.state.merchant;
    return !!mc.x && Math.abs(player.x - mc.x) + Math.abs(player.y - mc.y) <= 1;
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
    if (!item || item.kind === "orb" || (t.bag[item.id] ?? 0) <= 0) return;
    if (!Number.isInteger(target) || target < 0 || target >= t.team.length) return;
    const c = t.team[target];
    if (item.kind === "level") return this.useLevelItem(client, t, c, item.id);
    const max = calcStats(c).maxHp;
    if (c.hp >= max) return this.notice(client, "Essa criatura já está com a Vida cheia.");
    c.hp = Math.min(max, c.hp + item.power);
    t.bag[item.id] -= 1;
    if (t.bag[item.id] <= 0) delete t.bag[item.id];
    this.store.markDirty(t);
    this.sendProfile(client);
    this.notice(client, `${getSpecies(c.speciesId).name} recuperou Vida.`);
  }

  /** Doce Estelar: sobe 1 nível na hora (golpes novos e evolução incluídos). */
  private useLevelItem(client: Client, t: Trainer, c: Creature, itemId: string) {
    const before = getSpecies(c.speciesId).name;
    if (c.level >= maxLevelOf(c.speciesId)) return this.notice(client, `${before} já está no nível máximo.`);
    if (c.hp <= 0) return this.notice(client, `${before} está desmaiado. Cure no Centro de Cura antes.`);
    const { levels, learned } = gainXp(c, xpForLevel(c.level + 1) - c.xp);
    const evo = evolveIfReady(c);
    t.bag[itemId] -= 1;
    if (t.bag[itemId] <= 0) delete t.bag[itemId];
    if (evo) {
      if (!t.dex.seen.includes(evo.to)) t.dex.seen.push(evo.to);
      if (!t.dex.caught.includes(evo.to)) t.dex.caught.push(evo.to);
    }
    const parts = [`${before} subiu para o nível ${levels.at(-1) ?? c.level}!`];
    for (const id of learned) parts.push(`Aprendeu ${getMove(id).name}.`);
    if (evo) parts.push(`O quê? ${before} evoluiu para ${getSpecies(evo.to).name}!`);
    this.store.markDirty(t);
    this.sendProfile(client);
    const msg: DialogMessage = { title: evo ? "Evolução!" : "Doce Estelar", text: parts.join(" ") };
    client.send("dialog", msg);
  }

  // ---------- Casa do Treinador: troca de golpes ----------

  private nearRole(player: Player, role: string) {
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
      const o = objectAt(player.x + dx, player.y + dy);
      if (o?.role === role) return true;
    }
    return false;
  }

  /** Ensina um golpe que a criatura já pode saber (pelo nível) no lugar de outro, ou numa vaga livre. */
  private handleTutorTeach(client: Client, message: unknown) {
    const r = this.ready(client);
    if (!r || r.s.battle || r.s.duel || r.s.trade) return;
    if (!this.nearRole(r.player, "tutor")) {
      this.notice(client, "Fique na porta da Casa do Treinador para trocar golpes.");
      return;
    }
    const m = message as { index?: unknown; moveId?: unknown; replace?: unknown } | null;
    const t = r.s.trainer;
    const index = Number(m?.index);
    if (!Number.isInteger(index) || index < 0 || index >= t.team.length) return;
    const c = t.team[index];
    const moveId = typeof m?.moveId === "string" ? m.moveId : "";
    const opt = tutorOption(c.speciesId, moveId);
    if (!opt || c.moves.includes(moveId)) return;
    const name = getSpecies(c.speciesId).name;
    const moveName = getMove(moveId).name;
    if (c.level < opt.level) {
      this.notice(client, `${name} precisa estar no nível ${opt.level} para aprender ${moveName}.`);
      return;
    }
    if (t.money < opt.price) {
      this.notice(client, `${moveName} custa ${opt.price} Sementes. Você tem ${t.money}.`);
      return;
    }
    const replace = Number(m?.replace);
    let text: string;
    if (replace === -1) {
      if (c.moves.length >= MAX_MOVES) return;
      c.moves.push(moveId);
      text = `${name} aprendeu ${moveName}.`;
    } else {
      if (!Number.isInteger(replace) || replace < 0 || replace >= c.moves.length) return;
      const old = c.moves[replace];
      c.moves[replace] = moveId;
      text = `${name} esqueceu ${getMove(old).name} e aprendeu ${moveName}.`;
    }
    if (opt.price) {
      t.money -= opt.price;
      text += ` (−${opt.price} Sementes)`;
    }
    this.store.markDirty(t);
    this.sendProfile(client);
    this.notice(client, text);
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
