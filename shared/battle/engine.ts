// Motor de batalha puro: sem rede, sem relógio, RNG injetado.
// O servidor é o único que chama resolveTurn; o cliente só anima os eventos.
import { getMove, getSpecies, type StatusId } from "./data";
import { getItem } from "../items";
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

// ---------------- Evolução ----------------

/** Se a criatura atingiu o nível de evolução, evolui e devolve de/para. */
export function evolveIfReady(c: Creature): { from: string; to: string } | null {
  const evo = getSpecies(c.speciesId).evolvesTo;
  if (!evo || c.level < evo.level) return null;
  const from = c.speciesId;
  const before = calcStats(c).maxHp;
  c.speciesId = evo.species;
  c.hp = Math.max(0, c.hp + calcStats(c).maxHp - before);
  return { from, to: evo.species };
}

// ---------------- Batalha ----------------

export type Side = "player" | "foe";
export const other = (s: Side): Side => (s === "player" ? "foe" : "player");

export type Action =
  | { kind: "move"; moveIndex: number }
  | { kind: "run" }
  | { kind: "switch"; index: number }
  | { kind: "item"; itemId: string; target?: number };

export type BattleResult = "win" | "lose" | "ran" | "caught";

export interface BattleState {
  team: Creature[];
  /** índice da criatura em campo no time */
  active: number;
  foe: Creature;
  wild: boolean;
  turn: number;
  result: BattleResult | null;
  /** a criatura em campo desmaiou e o jogador precisa escolher outra */
  needSwitch: boolean;
  /** uids das criaturas do jogador que entraram em campo (dividem o XP) */
  participants: string[];
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
  | { t: "switch"; index: number; view: CreatureView }
  | { t: "heal"; index: number; itemId: string; amount: number; hp: number; maxHp: number }
  | { t: "throw"; itemId: string }
  | { t: "shake"; count: number }
  | { t: "caught"; speciesId: string }
  | { t: "escape" }
  | { t: "xp"; name: string; amount: number }
  | { t: "level"; name: string; level: number }
  | { t: "learn"; name: string; moveId: string }
  | { t: "evolve"; from: string; to: string }
  | { t: "money"; amount: number }
  | { t: "sent"; where: "team" | "box"; name: string }
  | { t: "end"; result: BattleResult };

export function activeOf(state: BattleState): Creature {
  return state.team[state.active];
}

export function startBattle(team: Creature[], foe: Creature, wild = true): BattleState {
  const active = Math.max(0, team.findIndex((c) => c.hp > 0));
  return {
    team,
    active,
    foe,
    wild,
    turn: 0,
    result: null,
    needSwitch: false,
    participants: [team[active].uid],
  };
}

function isIndex(n: unknown, length: number): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) < length;
}

/** Valida forma e regras da ação (o servidor confere a mochila à parte). */
export function isValidAction(state: BattleState, action: unknown): action is Action {
  if (!action || typeof action !== "object" || state.result) return false;
  const a = action as Record<string, unknown>;
  if (state.needSwitch) {
    return a.kind === "switch" && isIndex(a.index, state.team.length) && state.team[a.index as number].hp > 0;
  }
  switch (a.kind) {
    case "run":
      return state.wild;
    case "move":
      return isIndex(a.moveIndex, activeOf(state).moves.length);
    case "switch":
      return isIndex(a.index, state.team.length) && a.index !== state.active && state.team[a.index as number].hp > 0;
    case "item": {
      const item = getItem(a.itemId);
      if (!item) return false;
      if (item.kind === "orb") return state.wild;
      const target = a.target === undefined ? state.active : a.target;
      if (!isIndex(target, state.team.length)) return false;
      const c = state.team[target as number];
      return c.hp > 0 && c.hp < calcStats(c).maxHp;
    }
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

/** Chance de captura (ver "Captura" no documento de design). */
export function catchChance(foe: Creature, orbPower: number): number {
  const max = calcStats(foe).maxHp;
  const statusBonus = foe.status === "adormecido" ? 2 : foe.status === "paralisado" || foe.status === "assustado" ? 1.5 : 1;
  const p = (1 - (2 / 3) * (foe.hp / max)) * getSpecies(foe.speciesId).catchRate * orbPower * statusBonus;
  return Math.min(1, Math.max(0, p));
}

function applyStatus(target: Creature, status: StatusId, rng: Rng) {
  target.status = status;
  target.statusTurns = status === "adormecido" ? 1 + Math.floor(rng() * 3) : status === "assustado" ? 2 : 0;
}

/**
 * Resolve um turno inteiro e devolve os eventos em ordem. Muta `state`.
 * Itens e trocas acontecem antes dos golpes; uma troca forçada (após desmaio) não dá turno ao inimigo.
 */
export function resolveTurn(state: BattleState, playerAction: Action, foeAction: Action, rng: Rng): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (state.result) return events;
  state.turn += 1;
  const get = (s: Side) => (s === "player" ? activeOf(state) : state.foe);

  const finish = (result: BattleResult) => {
    state.result = result;
    events.push({ t: "end", result });
  };

  const doSwitch = (index: number) => {
    const out = activeOf(state);
    if (out.status === "assustado") {
      out.status = null;
      out.statusTurns = 0;
    }
    state.active = index;
    const c = activeOf(state);
    if (!state.participants.includes(c.uid)) state.participants.push(c.uid);
    events.push({ t: "switch", index, view: toView(c) });
  };

  /** Desmaio da criatura do jogador: troca forçada se houver outra de pé. */
  const playerFainted = () => {
    events.push({ t: "faint", side: "player" });
    if (state.team.some((c) => c.hp > 0)) state.needSwitch = true;
    else finish("lose");
  };

  // Troca forçada
  if (state.needSwitch) {
    if (playerAction.kind === "switch") doSwitch(playerAction.index);
    state.needSwitch = false;
    return events;
  }

  const order: Side[] = [];
  switch (playerAction.kind) {
    case "run": {
      const ps = effectiveSpeed(activeOf(state));
      const fs = Math.max(1, effectiveSpeed(state.foe));
      const ok = rng() < Math.min(1, 0.5 + (0.5 * ps) / fs);
      events.push({ t: "run", ok });
      if (ok) {
        finish("ran");
        return events;
      }
      order.push("foe");
      break;
    }
    case "switch":
      doSwitch(playerAction.index);
      order.push("foe");
      break;
    case "item": {
      const item = getItem(playerAction.itemId)!;
      if (item.kind === "heal") {
        const index = playerAction.target ?? state.active;
        const c = state.team[index];
        const max = calcStats(c).maxHp;
        const before = c.hp;
        c.hp = Math.min(max, c.hp + item.power);
        events.push({ t: "heal", index, itemId: item.id, amount: c.hp - before, hp: c.hp, maxHp: max });
      } else {
        events.push({ t: "throw", itemId: item.id });
        const caught = rng() < catchChance(state.foe, item.power);
        events.push({ t: "shake", count: caught ? 3 : Math.floor(rng() * 3) });
        if (caught) {
          events.push({ t: "caught", speciesId: state.foe.speciesId });
          finish("caught");
          return events;
        }
        events.push({ t: "escape" });
      }
      order.push("foe");
      break;
    }
    case "move": {
      // Ordem por prioridade do golpe, depois Velocidade, empate sorteado
      const prio = (s: Side, a: Action) => (a.kind === "move" ? getMove(get(s).moves[a.moveIndex]).priority ?? 0 : 0);
      const pp = prio("player", playerAction);
      const fp = prio("foe", foeAction);
      let playerFirst: boolean;
      if (pp !== fp) playerFirst = pp > fp;
      else {
        const ps = effectiveSpeed(activeOf(state));
        const fs = effectiveSpeed(state.foe);
        playerFirst = ps !== fs ? ps > fs : rng() < 0.5;
      }
      order.push(...((playerFirst ? ["player", "foe"] : ["foe", "player"]) as Side[]));
    }
  }

  // Cada lado age
  for (const side of order) {
    if (state.result || state.needSwitch) break;
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
        if (side === "player") {
          events.push({ t: "faint", side: "foe" });
          finish("win");
        } else playerFainted();
        break;
      }
    }

    if (move.effect && rng() < move.effect.chance) {
      if (target.status === null) {
        applyStatus(target, move.effect.status, rng);
        events.push({ t: "status", side: other(side), status: move.effect.status });
      } else if (move.power === null) {
        events.push({ t: "status_fail", side: other(side) });
      }
    } else if (move.effect && move.power === null) {
      events.push({ t: "status_fail", side: other(side) });
    }
  }

  // Efeitos de fim de turno
  if (!state.result && !state.needSwitch) {
    for (const side of ["player", "foe"] as Side[]) {
      if (state.result || state.needSwitch) break;
      const c = get(side);
      if (c.hp <= 0) continue;
      if (c.status === "queimado" || c.status === "envenenado") {
        const maxHp = calcStats(c).maxHp;
        const amount = Math.max(1, Math.floor(maxHp / (c.status === "queimado" ? 16 : 8)));
        c.hp = Math.max(0, c.hp - amount);
        events.push({ t: "tick", side, status: c.status, amount, hp: c.hp, maxHp });
        if (c.hp === 0) {
          if (side === "foe") {
            events.push({ t: "faint", side: "foe" });
            finish("win");
          } else playerFainted();
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

/**
 * Recompensas de vitória ou captura: XP para quem participou e está de pé,
 * subida de nível, golpes novos e evolução. Devolve os eventos (antes do "end").
 */
export function awardExperience(state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  const total = xpReward(state.foe, !state.wild);
  const earners = state.team.filter((c) => c.hp > 0 && state.participants.includes(c.uid));
  if (!earners.length) return events;
  const share = Math.max(1, Math.floor(total / earners.length));
  for (const c of earners) {
    const name = getSpecies(c.speciesId).name;
    events.push({ t: "xp", name, amount: share });
    const { levels, learned } = gainXp(c, share);
    for (const level of levels) events.push({ t: "level", name, level });
    for (const moveId of learned) events.push({ t: "learn", name, moveId });
    const evo = evolveIfReady(c);
    if (evo) events.push({ t: "evolve", ...evo });
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
