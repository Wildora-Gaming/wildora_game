import type { BattleEvent, CreatureView } from "./battle/engine";

// Constantes compartilhadas entre cliente e servidor.
// Tudo que define regra de jogo mora aqui, para os dois lados nunca divergirem.

export const TILE_SIZE = 32;

/** Tempo mínimo entre dois passos de um jogador (ms). O servidor impõe isso. */
export const MOVE_COOLDOWN_MS = 160;

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

// Batalha (servidor → cliente). Os tipos vêm do motor em shared/battle.

/** Intervalo mínimo entre duas ações de batalha (ms). */
export const BATTLE_ACTION_COOLDOWN_MS = 300;

export interface TeamMessage {
  team: CreatureView[];
}
export interface BattleStartMessage {
  wild: boolean;
  player: CreatureView;
  foe: CreatureView;
}
export interface BattleTurnMessage {
  events: BattleEvent[];
  player: CreatureView;
  foe: CreatureView;
  over: boolean;
}
