// Motor de batalha puro: sem rede, sem relógio, RNG injetado.
// O servidor é o único que chama resolveTurn; o cliente só anima os eventos.
import { getMove, getSpecies, type StatusId } from "./data";
import { effectiveness, type TypeId } from "./types";

export type Rng = () => number;

export const MAX_LEVEL = 60;
export const MAX_MOVES = 4;
const CRIT_CHANCE = 1 / 16;
const CRIT_MULT = 1.5;
const STAB = 1.5;

export interface Creature {
  uid: string;
  speciesId: string;
  level: number;
  /** XP total acumulado */
  xp: number;
  hp: number;
  status: StatusId | null;
  /** turnos restantes do estado (sono, susto) */
  statusTurns: number;
  moves: string[];
}

export interface Stats {
  maxHp: number;
  atk: number;
  def: number;
  spe: number;
}

export function xpForLevel(level: number): number {
  return level ** 3;
}

export function calcStats(c: Pick<Creature, "speciesId" | "level">): Stats {
  const { base } = getSpecies(c.speciesId);
  const n = c.level;
  const stat = (b: number) => Math.floor((b * 2 * n) / 100) + 5;
  return {
    maxHp: Math.floor((base.hp * 2 * n) / 100) + n + 10,
    atk: stat(base.atk),
    def: stat(base.def),
    spe: stat(base.spe),
  };
}

/** Golpes que a espécie conhece no nível: os 4 últimos aprendidos. */
export function movesAtLevel(speciesId: string, level: number): string[] {
  const learned = getSpecies(speciesId)
    .learnset.filter(([lvl]) => lvl <= level)
    .map(([, move]) => move as string);
  return learned.slice(-MAX_MOVES);
}

let uidCounter = 0;
export function createCreature(speciesId: string, level: number, uid?: string): Creature {
  const c: Creature = {
    uid: uid ?? `c${Date.now().toString(36)}${(uidCounter++).toString(36)}`,
    speciesId,
    level,
    xp: xpForLevel(level),
    hp: 0,
    status: null,
    statusTurns: 0,
    moves: movesAtLevel(speciesId, level),
  };
  c.hp = calcStats(c).maxHp;
  return c;
}

export function healFully(c: Creature) {
  c.hp = calcStats(c).maxHp;
  c.status = null;
  c.statusTurns = 0;
}

/** XP ganho ao derrotar uma criatura (×1,5 contra treinadores). */
export function xpReward(defeated: Creature, trainer = false): number {
  const base = Math.floor((getSpecies(defeated.speciesId).baseXp * defeated.level) / 5);
  return trainer ? Math.floor(base * 1.5) : base;
}

export interface XpResult {
  levels: number[];
  learned: string[];
}

/** Aplica XP, sobe de nível e aprende golpes. Vida máxima nova é somada à atual. */
export function gainXp(c: Creature, amount: number): XpResult {
  const result: XpResult = { levels: [], learned: [] };
  c.xp += amount;
  while (c.level < MAX_LEVEL && c.xp >= xpForLevel(c.level + 1)) {
    const before = calcStats(c).maxHp;
    c.level += 1;
    c.hp += calcStats(c).maxHp - before;
    result.levels.push(c.level);
    for (const [lvl, move] of getSpecies(c.speciesId).learnset) {
      if (lvl === c.level && !c.moves.includes(move)) {
        c.moves.push(move);
        if (c.moves.length > MAX_MOVES) c.moves.shift();
        result.learned.push(move);
      }
    }
  }
  return result;
}

// ---------------- Batalha ----------------

export type Side = "player" | "foe";
export const other = (s: Side): Side => (s === "player" ? "foe" : "player");

export type Action = { kind: "move"; moveIndex: number } | { kind: "run" };

export type BattleResult = "win" | "lose" | "ran";

export interface BattleState {
  player: Creature;
  foe: Creature;
  wild: boolean;
  turn: number;
  result: BattleResult | null;
}

export type BattleEvent =
  | { t: "use"; side: Side; moveId: string }
  | { t: "miss"; side: Side }
  | { t: "damage"; side: Side; amount: number; hp: number; maxHp: number; eff: number; crit: boolean }
  | { t: "status"; side: Side; status: StatusId }
  | { t: "status_fail"; side: Side }
  | { t: "skip"; side: Side; status: StatusId }
  | { t: "wake"; side: Side }
  | { t: "calm"; side: Side }
  | { t: "tick"; side: Side; status: StatusId; amount: number; hp: number; maxHp: number }
  | { t: "faint"; side: Side }
  | { t: "run"; ok: boolean }
  | { t: "xp"; amount: number }
  | { t: "level"; level: number }
  | { t: "learn"; moveId: string }
  | { t: "end"; result: BattleResult };

export function startBattle(player: Creature, foe: Creature, wild = true): BattleState {
  return { player, foe, wild, turn: 0, result: null };
}

export function isValidAction(state: BattleState, action: unknown): action is Action {
  if (!action || typeof action !== "object") return false;
  const a = action as { kind?: unknown; moveIndex?: unknown };
  if (a.kind === "run") return state.wild;
  if (a.kind === "move") {
    return Number.isInteger(a.moveIndex) && (a.moveIndex as number) >= 0 && (a.moveIndex as number) < state.player.moves.length;
  }
  return false;
}

export function chooseWildAction(state: BattleState, rng: Rng): Action {
  return { kind: "move", moveIndex: Math.floor(rng() * state.foe.moves.length) };
}

function effectiveSpeed(c: Creature): number {
  const spe = calcStats(c).spe;
  return c.status === "paralisado" ? Math.floor(spe / 2) : spe;
}

export function calcDamage(
  attacker: Creature,
  defender: Creature,
  moveId: string,
  rng: Rng,
): { amount: number; eff: number; crit: boolean } {
  const move = getMove(moveId);
  if (move.power === null) return { amount: 0, eff: 1, crit: false };
  const a = calcStats(attacker);
  const d = calcStats(defender);
  const atk = attacker.status === "queimado" ? Math.floor(a.atk * 0.75) : a.atk;
  const n = attacker.level;
  const base = Math.floor((((2 * n) / 5 + 2) * move.power * (atk / d.def)) / 50 + 2);
  const defTypes = getSpecies(defender.speciesId).types as TypeId[];
  const eff = effectiveness(move.type, defTypes);
  const stab = (getSpecies(attacker.speciesId).types as TypeId[]).includes(move.type) ? STAB : 1;
  const crit = rng() < CRIT_CHANCE;
  const r = 0.85 + rng() * 0.15;
  const amount = Math.max(1, Math.floor(base * eff * stab * (crit ? CRIT_MULT : 1) * r));
  return { amount, eff, crit };
}

function applyStatus(target: Creature, status: StatusId, rng: Rng) {
  target.status = status;
  target.statusTurns = status === "adormecido" ? 1 + Math.floor(rng() * 3) : status === "assustado" ? 2 : 0;
}

/**
 * Resolve um turno inteiro e devolve os eventos em ordem.
 * Muta `state`. Depois de `result` definido, não faz nada.
 */
export function resolveTurn(state: BattleState, playerAction: Action, foeAction: Action, rng: Rng): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (state.result) return events;
  state.turn += 1;
  const get = (s: Side) => (s === "player" ? state.player : state.foe);

  const finish = (result: BattleResult) => {
    state.result = result;
    events.push({ t: "end", result });
  };

  // 1. Fuga resolve antes de tudo
  const order: Side[] = [];
  if (playerAction.kind === "run") {
    const ps = effectiveSpeed(state.player);
    const fs = Math.max(1, effectiveSpeed(state.foe));
    const ok = rng() < Math.min(1, 0.5 + (0.5 * ps) / fs);
    events.push({ t: "run", ok });
    if (ok) {
      finish("ran");
      return events;
    }
    order.push("foe");
  } else {
    // 2. Ordem por prioridade do golpe, depois Velocidade, empate sorteado
    const prio = (s: Side, a: Action) => (a.kind === "move" ? getMove(get(s).moves[a.moveIndex]).priority ?? 0 : 0);
    const pp = prio("player", playerAction);
    const fp = prio("foe", foeAction);
    let playerFirst: boolean;
    if (pp !== fp) playerFirst = pp > fp;
    else {
      const ps = effectiveSpeed(state.player);
      const fs = effectiveSpeed(state.foe);
      playerFirst = ps !== fs ? ps > fs : rng() < 0.5;
    }
    order.push(...((playerFirst ? ["player", "foe"] : ["foe", "player"]) as Side[]));
  }

  // 3. Cada lado age
  for (const side of order) {
    if (state.result) break;
    const actor = get(side);
    const target = get(other(side));
    const action = side === "player" ? playerAction : foeAction;
    if (action.kind !== "move" || actor.hp <= 0) continue;

    if (actor.status === "adormecido") {
      if (actor.statusTurns > 0) {
        actor.statusTurns -= 1;
        events.push({ t: "skip", side, status: "adormecido" });
        continue;
      }
      actor.status = null;
      events.push({ t: "wake", side });
    }
    if (actor.status === "paralisado" && rng() < 0.25) {
      events.push({ t: "skip", side, status: "paralisado" });
      continue;
    }
    if (actor.status === "assustado" && rng() < 0.3) {
      events.push({ t: "skip", side, status: "assustado" });
      continue;
    }

    const moveId = actor.moves[action.moveIndex];
    const move = getMove(moveId);
    events.push({ t: "use", side, moveId });

    if (rng() * 100 >= move.accuracy) {
      events.push({ t: "miss", side });
      continue;
    }

    if (move.power !== null) {
      const { amount, eff, crit } = calcDamage(actor, target, moveId, rng);
      target.hp = Math.max(0, target.hp - amount);
      events.push({ t: "damage", side: other(side), amount, hp: target.hp, maxHp: calcStats(target).maxHp, eff, crit });
      if (target.hp === 0) {
        events.push({ t: "faint", side: other(side) });
        finish(side === "player" ? "win" : "lose");
        break;
      }
    }

    if (move.effect) {
      if (rng() < move.effect.chance) {
        if (target.status === null) {
          applyStatus(target, move.effect.status, rng);
          events.push({ t: "status", side: other(side), status: move.effect.status });
        } else if (move.power === null) {
          events.push({ t: "status_fail", side: other(side) });
        }
      }
    }
  }

  // 4. Efeitos de fim de turno
  if (!state.result) {
    for (const side of ["player", "foe"] as Side[]) {
      if (state.result) break;
      const c = get(side);
      if (c.status === "queimado" || c.status === "envenenado") {
        const maxHp = calcStats(c).maxHp;
        const amount = Math.max(1, Math.floor(maxHp / (c.status === "queimado" ? 16 : 8)));
        c.hp = Math.max(0, c.hp - amount);
        events.push({ t: "tick", side, status: c.status, amount, hp: c.hp, maxHp });
        if (c.hp === 0) {
          events.push({ t: "faint", side });
          finish(side === "player" ? "lose" : "win");
        }
      } else if (c.status === "assustado") {
        c.statusTurns -= 1;
        if (c.statusTurns <= 0) {
          c.status = null;
          c.statusTurns = 0;
          events.push({ t: "calm", side });
        }
      }
    }
  }

  return events;
}

// ---------------- Visão pública ----------------

export interface MoveView {
  id: string;
  name: string;
  type: TypeId;
  power: number | null;
  accuracy: number;
}

export interface CreatureView {
  uid: string;
  speciesId: string;
  name: string;
  types: TypeId[];
  level: number;
  hp: number;
  maxHp: number;
  status: StatusId | null;
  /** XP dentro do nível atual (0–1) */
  xpProgress: number;
  moves: MoveView[];
}

export function toView(c: Creature, withMoves = true): CreatureView {
  const s = getSpecies(c.speciesId);
  const floor = xpForLevel(c.level);
  const next = xpForLevel(c.level + 1);
  return {
    uid: c.uid,
    speciesId: c.speciesId,
    name: s.name,
    types: s.types as TypeId[],
    level: c.level,
    hp: c.hp,
    maxHp: calcStats(c).maxHp,
    status: c.status,
    xpProgress: c.level >= MAX_LEVEL ? 1 : Math.min(1, Math.max(0, (c.xp - floor) / (next - floor))),
    moves: withMoves
      ? c.moves.map((id) => {
          const m = getMove(id);
          return { id: m.id, name: m.name, type: m.type, power: m.power, accuracy: m.accuracy };
        })
      : [],
  };
}
