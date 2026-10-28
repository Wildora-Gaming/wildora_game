import { Room, Client } from "@colyseus/core";
import { Player, WorldState } from "../schema/WorldState";
import {
  BATTLE_ACTION_COOLDOWN_MS,
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  DIRECTION_DELTA,
  ENCOUNTER_CHANCE,
  MAX_PLAYERS_PER_ROOM,
  MOVE_COOLDOWN_MS,
  NAME_MAX_LENGTH,
  isDirection,
  type BattleStartMessage,
  type BattleTurnMessage,
  type ChatBroadcast,
  type TeamMessage,
} from "../../../shared/constants";
import { SPAWN, Tile, isWalkable, tileAt } from "../../../shared/map";
import { ZONE_CAMPINA_INICIAL, rollWild } from "../../../shared/creatures";
import { STARTERS, STARTER_LEVEL, isSpeciesId } from "../../../shared/battle/data";
import {
  chooseWildAction,
  createCreature,
  gainXp,
  healFully,
  isValidAction,
  resolveTurn,
  startBattle,
  toView,
  xpReward,
  type BattleEvent,
  type BattleState,
  type Creature,
} from "../../../shared/battle/engine";

interface JoinOptions {
  name?: unknown;
  starter?: unknown;
}

// Dados por conexão que não vão para o estado público.
// Time e batalha ficam aqui até a fase 2 (Postgres).
interface ClientMeta {
  lastMoveAt: number;
  lastChatAt: number;
  lastBattleActionAt: number;
  team: Creature[];
  battle: BattleState | null;
}

const PLAYER_COLORS = [0xe4572e, 0x17bebb, 0xffc914, 0x76b041, 0x9b5de5, 0xf15bb5, 0x00bbf9, 0xfee440];

function sanitizeName(raw: unknown): string {
  const base = typeof raw === "string" ? raw : "";
  const clean = base.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, NAME_MAX_LENGTH);
  return clean || `Treinador${Math.floor(1000 + Math.random() * 9000)}`;
}

export class WorldRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  private meta = new Map<string, ClientMeta>();

  /** Permite injetar RNG determinístico nos testes. */
  rng: () => number = Math.random;

  onCreate() {
    this.setState(new WorldState());

    this.onMessage("move", (client, message: unknown) => this.handleMove(client, message));
    this.onMessage("chat", (client, message: unknown) => this.handleChat(client, message));
    this.onMessage("battle_action", (client, message: unknown) => this.handleBattleAction(client, message));

    // Mensagens desconhecidas são ignoradas em silêncio.
    this.onMessage("*", () => {});
  }

  onJoin(client: Client, options: JoinOptions = {}) {
    const name = sanitizeName(options.name);
    const color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    this.state.players.set(client.sessionId, Player.create(name, SPAWN.x, SPAWN.y, color));

    const starter =
      isSpeciesId(options.starter) && STARTERS.includes(options.starter) ? options.starter : STARTERS[0];
    this.meta.set(client.sessionId, {
      lastMoveAt: 0,
      lastChatAt: 0,
      lastBattleActionAt: 0,
      team: [createCreature(starter, STARTER_LEVEL)],
      battle: null,
    });

    this.sendTeam(client);
    this.broadcastSystem(`${name} entrou na Campina Inicial.`);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.meta.delete(client.sessionId);
    if (player) this.broadcastSystem(`${player.name} saiu.`);
  }

  // ---------- Movimento ----------

  private handleMove(client: Client, message: unknown) {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta || meta.battle) return; // em batalha não anda

    const dir = (message as { dir?: unknown } | null)?.dir;
    if (!isDirection(dir)) return;

    // O servidor é a autoridade: o cliente só pede, quem decide é aqui.
    const now = Date.now();
    if (now - meta.lastMoveAt < MOVE_COOLDOWN_MS) return;
    meta.lastMoveAt = now;

    player.dir = dir;
    const { dx, dy } = DIRECTION_DELTA[dir];
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!isWalkable(nx, ny)) return; // só vira de lado

    player.x = nx;
    player.y = ny;

    if (tileAt(nx, ny) === Tile.TallGrass && this.rng() < ENCOUNTER_CHANCE) {
      const { entry, level } = rollWild(ZONE_CAMPINA_INICIAL, this.rng);
      this.beginWildBattle(client, player, meta, createCreature(entry.speciesId, level));
    }
  }

  // ---------- Batalha ----------

  private beginWildBattle(client: Client, player: Player, meta: ClientMeta, wild: Creature) {
    const lead = meta.team.find((c) => c.hp > 0);
    if (!lead) return;
    meta.battle = startBattle(lead, wild, true);
    player.inBattle = true;
    const msg: BattleStartMessage = { wild: true, player: toView(lead), foe: toView(wild, false) };
    client.send("battle_start", msg);
  }

  private handleBattleAction(client: Client, message: unknown) {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    const battle = meta?.battle;
    if (!player || !meta || !battle || battle.result) return;
    if (!isValidAction(battle, message)) return;

    const now = Date.now();
    if (now - meta.lastBattleActionAt < BATTLE_ACTION_COOLDOWN_MS) return;
    meta.lastBattleActionAt = now;

    const events: BattleEvent[] = resolveTurn(battle, message, chooseWildAction(battle, this.rng), this.rng);

    if (battle.result === "win") {
      const amount = xpReward(battle.foe, !battle.wild);
      const { levels, learned } = gainXp(battle.player, amount);
      // XP vem antes do "end" para o cliente mostrar na ordem certa
      const end = events.pop()!;
      events.push({ t: "xp", amount });
      for (const level of levels) events.push({ t: "level", level });
      for (const moveId of learned) events.push({ t: "learn", moveId });
      events.push(end);
    } else if (battle.result === "lose") {
      // Sem centro de cura ainda: volta ao spawn com o time recuperado.
      for (const c of meta.team) healFully(c);
      player.x = SPAWN.x;
      player.y = SPAWN.y;
      player.dir = "down";
    }

    const over = battle.result !== null;
    const msg: BattleTurnMessage = { events, player: toView(battle.player), foe: toView(battle.foe, false), over };
    client.send("battle_turn", msg);

    if (over) {
      meta.battle = null;
      player.inBattle = false;
      this.sendTeam(client);
    }
  }

  private sendTeam(client: Client) {
    const meta = this.meta.get(client.sessionId);
    if (!meta) return;
    const msg: TeamMessage = { team: meta.team.map((c) => toView(c)) };
    client.send("team", msg);
  }

  // ---------- Chat ----------

  private handleChat(client: Client, message: unknown) {
    const player = this.state.players.get(client.sessionId);
    const meta = this.meta.get(client.sessionId);
    if (!player || !meta) return;

    const raw = (message as { text?: unknown } | null)?.text;
    if (typeof raw !== "string") return;
    const text = raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;

    const now = Date.now();
    if (now - meta.lastChatAt < CHAT_COOLDOWN_MS) return;
    meta.lastChatAt = now;

    const payload: ChatBroadcast = { from: player.name, text };
    this.broadcast("chat", payload);
  }

  private broadcastSystem(text: string) {
    const payload: ChatBroadcast = { from: "", text, system: true };
    this.broadcast("chat", payload);
  }
}
