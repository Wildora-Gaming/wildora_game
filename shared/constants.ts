import type { BattleEvent, CreatureView } from "./battle/engine";

// Constantes compartilhadas entre cliente e servidor.
// Tudo que define regra de jogo mora aqui, para os dois lados nunca divergirem.

export const TILE_SIZE = 16;

/** Tempo de um passo (ms). O servidor limita a velocidade média a 1 passo por este intervalo. */
export const MOVE_COOLDOWN_MS = 160;

/** Passos que podem chegar juntos (variação da rede) sem serem recusados. */
export const MOVE_BURST = 3;

/** Chance de encontro a cada passo na grama alta (0–1). */
export const ENCOUNTER_CHANCE = 0.12;

export const CHAT_MAX_LENGTH = 140;
export const CHAT_COOLDOWN_MS = 700;
export const NAME_MAX_LENGTH = 16;

export const ROOM_NAME = "world";
export const MAX_PLAYERS_PER_ROOM = 100;

export type Direction = "up" | "down" | "left" | "right";

export const DIRECTION_DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export function isDirection(value: unknown): value is Direction {
  return value === "up" || value === "down" || value === "left" || value === "right";
}

/** Mensagens cliente → servidor */
export interface MoveMessage {
  dir: Direction;
}
export interface ChatMessage {
  text: string;
}

/** Mensagens servidor → cliente */
export interface ChatBroadcast {
  from: string;
  text: string;
  system?: boolean;
}

// ---------------- Regras de conta e progresso ----------------

export const PASSWORD_MIN_LENGTH = 4;
export const TEAM_MAX = 6;

/** Ciclo dia/noite: duração total e quanto dela é noite (ms). */
export const DAY_CYCLE_MS = 20 * 60 * 1000;
export const NIGHT_MS = 6 * 60 * 1000;

export function isNightAt(time: number) {
  return time % DAY_CYCLE_MS >= DAY_CYCLE_MS - NIGHT_MS;
}

// ---------------- Mensagens servidor → cliente ----------------

/** Intervalo mínimo entre duas ações de batalha (ms). */
export const BATTLE_ACTION_COOLDOWN_MS = 300;

export interface ProfileMessage {
  name: string;
  money: number;
  bag: Record<string, number>;
  team: CreatureView[];
  box: CreatureView[];
  dex: { seen: number; caught: number };
}
export interface BattleStartMessage {
  wild: boolean;
  team: CreatureView[];
  active: number;
  foe: CreatureView;
  zone: string;
}
export interface BattleTurnMessage {
  events: BattleEvent[];
  team: CreatureView[];
  active: number;
  foe: CreatureView;
  over: boolean;
  needSwitch: boolean;
  bag: Record<string, number>;
}
export interface DialogMessage {
  title: string;
  text: string;
}
export interface ShopMessage {
  items: { id: string; name: string; description: string; price: number }[];
  money: number;
}
export interface NoticeMessage {
  text: string;
}
