// Batalha entre dois jogadores. Mesmas regras de dano, estados e ordem do motor principal,
// mas simétrica: os dois lados escolhem golpe ou troca e o turno só resolve com as duas escolhas.
// Batalha amistosa: as criaturas lutam com Vida cheia (cópias) e nada muda no time de verdade.
import { getMove } from "./data";
import {
  applyStatus,
  calcDamage,
  calcStats,
  effectiveSpeed,
  healFully,
  toView,
  type BattleEvent,
  type Creature,
  type CreatureView,
  type Rng,
} from "./engine";

export type PvpSlot = 0 | 1;
export const otherSlot = (s: PvpSlot): PvpSlot => (s === 0 ? 1 : 0);

export type PvpAction = { kind: "move"; moveIndex: number } | { kind: "switch"; index: number };

export interface PvpSide {
  team: Creature[];
  active: number;
  /** a criatura em campo desmaiou e o jogador precisa escolher outra */
  needSwitch: boolean;
}

export interface PvpState {
  sides: [PvpSide, PvpSide];
  turn: number;
  /** null = em andamento; winner null = empate */
  result: { winner: PvpSlot | null } | null;
}

/**
 * Evento neutro (com o lado como 0/1). `forSlot` traduz para o ponto de vista de cada jogador,
 * no mesmo formato das outras batalhas, para o cliente animar igual.
 */
export type PvpEvent =
  | { t: "use"; s: PvpSlot; moveId: string }
  | { t: "miss"; s: PvpSlot }
  | { t: "damage"; s: PvpSlot; amount: number; hp: number; maxHp: number; eff: number; crit: boolean }
  | { t: "status"; s: PvpSlot; status: NonNullable<Creature["status"]> }
  | { t: "status_fail"; s: PvpSlot }
  | { t: "skip"; s: PvpSlot; status: NonNullable<Creature["status"]> }
  | { t: "wake"; s: PvpSlot }
  | { t: "calm"; s: PvpSlot }
  | { t: "tick"; s: PvpSlot; status: NonNullable<Creature["status"]>; amount: number; hp: number; maxHp: number }
  | { t: "faint"; s: PvpSlot }
  | { t: "switch"; s: PvpSlot; index: number; view: CreatureView; left: number };

/** Copia os times com Vida cheia e sem estados. */
export function startPvp(teamA: Creature[], teamB: Creature[]): PvpState {
  const copy = (team: Creature[]): PvpSide => {
    const t = team.map((c) => {
      const k: Creature = { ...c, moves: [...c.moves] };
      healFully(k);
      return k;
    });
    return { team: t, active: 0, needSwitch: false };
  };
  return { sides: [copy(teamA), copy(teamB)], turn: 0, result: null };
}

export const pvpActive = (state: PvpState, s: PvpSlot) => state.sides[s].team[state.sides[s].active];
export const pvpLeft = (side: PvpSide) => side.team.filter((c) => c.hp > 0).length;

/** Quem precisa escolher algo agora (troca forçada tem prioridade sobre o turno normal). */
export function pvpWaitingOn(state: PvpState): PvpSlot[] {
  if (state.result) return [];
  const forced = ([0, 1] as PvpSlot[]).filter((s) => state.sides[s].needSwitch);
  return forced.length ? forced : [0, 1];
}

function isIndex(n: unknown, length: number): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) < length;
}

export function isValidPvpAction(state: PvpState, s: PvpSlot, action: unknown): action is PvpAction {
  if (!action || typeof action !== "object" || state.result) return false;
  const a = action as Record<string, unknown>;
  const side = state.sides[s];
  if (side.needSwitch) return a.kind === "switch" && isIndex(a.index, side.team.length) && side.team[a.index].hp > 0;
  if (!pvpWaitingOn(state).includes(s)) return false;
  if (a.kind === "move") return isIndex(a.moveIndex, pvpActive(state, s).moves.length);
  if (a.kind === "switch") return isIndex(a.index, side.team.length) && a.index !== side.active && side.team[a.index].hp > 0;
  return false;
}

/** Ação automática (tempo esgotado): primeiro golpe, ou a primeira criatura de pé na troca forçada. */
export function autoPvpAction(state: PvpState, s: PvpSlot): PvpAction {
  const side = state.sides[s];
  if (side.needSwitch) return { kind: "switch", index: side.team.findIndex((c) => c.hp > 0) };
  return { kind: "move", moveIndex: 0 };
}

/**
 * Resolve o turno com as ações de quem estava sendo esperado (`pvpWaitingOn`). Muta `state`.
 * Trocas antes dos golpes; golpes por prioridade e Velocidade (empate sorteado).
 */
export function resolvePvpTurn(state: PvpState, actions: Partial<Record<PvpSlot, PvpAction>>, rng: Rng): PvpEvent[] {
  const events: PvpEvent[] = [];
  if (state.result) return events;
  const get = (s: PvpSlot) => pvpActive(state, s);

  const doSwitch = (s: PvpSlot, index: number) => {
    const side = state.sides[s];
    const out = side.team[side.active];
    if (out.status === "assustado") {
      out.status = null;
      out.statusTurns = 0;
    }
    side.active = index;
    events.push({ t: "switch", s, index, view: toView(side.team[index]), left: pvpLeft(side) });
  };

  // Troca forçada: só quem precisava escolhe; o outro lado não age.
  const forced = ([0, 1] as PvpSlot[]).filter((s) => state.sides[s].needSwitch);
  if (forced.length) {
    for (const s of forced) {
      const a = actions[s];
      if (a?.kind === "switch") doSwitch(s, a.index);
      state.sides[s].needSwitch = false;
    }
    return events;
  }

  state.turn += 1;
  const act = { 0: actions[0]!, 1: actions[1]! } as Record<PvpSlot, PvpAction>;

  // 1) trocas (mais rápido primeiro não importa: só muda quem está em campo)
  for (const s of [0, 1] as PvpSlot[]) {
    const a = act[s];
    if (a.kind === "switch") doSwitch(s, a.index);
  }

  // 2) golpes, por prioridade e depois Velocidade
  const movers = ([0, 1] as PvpSlot[]).filter((s) => act[s].kind === "move");
  const prio = (s: PvpSlot) => {
    const a = act[s];
    return a.kind === "move" ? getMove(get(s).moves[a.moveIndex]).priority ?? 0 : 0;
  };
  movers.sort((x, y) => {
    if (prio(x) !== prio(y)) return prio(y) - prio(x);
    const sx = effectiveSpeed(get(x));
    const sy = effectiveSpeed(get(y));
    if (sx !== sy) return sy - sx;
    return 0;
  });
  if (movers.length === 2 && prio(0) === prio(1) && effectiveSpeed(get(0)) === effectiveSpeed(get(1)) && rng() < 0.5) movers.reverse();

  for (const s of movers) {
    const a = act[s];
    if (a.kind !== "move") continue;
    const actor = get(s);
    const t = otherSlot(s);
    const target = get(t);
    if (actor.hp <= 0 || target.hp <= 0) continue;

    if (actor.status === "adormecido") {
      if (actor.statusTurns > 0) {
        actor.statusTurns -= 1;
        events.push({ t: "skip", s, status: "adormecido" });
        continue;
      }
      actor.status = null;
      events.push({ t: "wake", s });
    }
    if (actor.status === "paralisado" && rng() < 0.25) {
      events.push({ t: "skip", s, status: "paralisado" });
      continue;
    }
    if (actor.status === "assustado" && rng() < 0.3) {
      events.push({ t: "skip", s, status: "assustado" });
      continue;
    }

    const moveId = actor.moves[a.moveIndex];
    const move = getMove(moveId);
    events.push({ t: "use", s, moveId });
    if (rng() * 100 >= move.accuracy) {
      events.push({ t: "miss", s });
      continue;
    }
    if (move.power !== null) {
      const { amount, eff, crit } = calcDamage(actor, target, moveId, rng);
      target.hp = Math.max(0, target.hp - amount);
      events.push({ t: "damage", s: t, amount, hp: target.hp, maxHp: calcStats(target).maxHp, eff, crit });
      if (target.hp === 0) {
        events.push({ t: "faint", s: t });
        continue;
      }
    }
    if (move.effect && rng() < move.effect.chance) {
      if (target.status === null) {
        applyStatus(target, move.effect.status, rng);
        events.push({ t: "status", s: t, status: move.effect.status });
      } else if (move.power === null) {
        events.push({ t: "status_fail", s: t });
      }
    } else if (move.effect && move.power === null) {
      events.push({ t: "status_fail", s: t });
    }
  }

  // 3) fim de turno: queimadura, veneno, susto
  for (const s of [0, 1] as PvpSlot[]) {
    const c = get(s);
    if (c.hp <= 0) continue;
    if (c.status === "queimado" || c.status === "envenenado") {
      const maxHp = calcStats(c).maxHp;
      const amount = Math.max(1, Math.floor(maxHp / (c.status === "queimado" ? 16 : 8)));
      c.hp = Math.max(0, c.hp - amount);
      events.push({ t: "tick", s, status: c.status, amount, hp: c.hp, maxHp });
      if (c.hp === 0) events.push({ t: "faint", s });
    } else if (c.status === "assustado") {
      c.statusTurns -= 1;
      if (c.statusTurns <= 0) {
        c.status = null;
        c.statusTurns = 0;
        events.push({ t: "calm", s });
      }
    }
  }

  // 4) desmaios: troca forçada ou fim
  const out = ([0, 1] as PvpSlot[]).filter((s) => get(s).hp <= 0 && pvpLeft(state.sides[s]) === 0);
  if (out.length === 2) state.result = { winner: null };
  else if (out.length === 1) state.result = { winner: otherSlot(out[0]) };
  else for (const s of [0, 1] as PvpSlot[]) if (get(s).hp <= 0) state.sides[s].needSwitch = true;

  return events;
}

/** Traduz os eventos para o ponto de vista de um jogador (formato das outras batalhas). */
export function forSlot(events: PvpEvent[], me: PvpSlot): BattleEvent[] {
  const side = (s: PvpSlot) => (s === me ? "player" : "foe") as "player" | "foe";
  return events.map((e): BattleEvent => {
    switch (e.t) {
      case "switch":
        return e.s === me
          ? { t: "switch", index: e.index, view: e.view }
          : { t: "foe_switch", view: { ...e.view, moves: [] }, left: e.left };
      case "use":
        return { t: "use", side: side(e.s), moveId: e.moveId };
      case "miss":
      case "wake":
      case "calm":
      case "faint":
      case "status_fail":
        return { t: e.t, side: side(e.s) } as BattleEvent;
      case "damage":
        return { t: "damage", side: side(e.s), amount: e.amount, hp: e.hp, maxHp: e.maxHp, eff: e.eff, crit: e.crit };
      case "status":
        return { t: "status", side: side(e.s), status: e.status };
      case "skip":
        return { t: "skip", side: side(e.s), status: e.status };
      case "tick":
        return { t: "tick", side: side(e.s), status: e.status, amount: e.amount, hp: e.hp, maxHp: e.maxHp };
    }
  });
}
