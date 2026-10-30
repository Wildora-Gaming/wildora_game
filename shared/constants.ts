import type { BattleEvent, CreatureView } from "./battle/engine";

// Constantes compartilhadas entre cliente e servidor.
// Tudo que define regra de jogo mora aqui, para os dois lados nunca divergirem.

export const TILE_SIZE = 16;

/** Tempo de um passo (ms). O servidor limita a velocidade média a 1 passo por este intervalo. */
export const MOVE_COOLDOWN_MS = 160;

/** Passos que podem chegar juntos (variação da rede) sem serem recusados. */
export const MOVE_BURST = 8;

/** Chance de encontro a cada passo na grama alta (0–1). */
export const ENCOUNTER_CHANCE = 0.12;

// ---------------- Evento dos lendários ----------------

/** Intervalo entre um lendário e o próximo (sorteado entre os dois). */
export const LEGEND_INTERVAL_MS: [number, number] = [2 * 60 * 60 * 1000, 3 * 60 * 60 * 1000];
/** Primeiro lendário depois que o servidor (a sala) abre. */
export const LEGEND_FIRST_MS: [number, number] = [20 * 60 * 1000, 40 * 60 * 1000];
/** Quanto tempo o lendário fica no mapa. */
export const LEGEND_DURATION_MS = 15 * 60 * 1000;
export const LEGEND_LEVEL: [number, number] = [60, 80];

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
  badges: string[];
}
export interface TrainerInfo {
  name: string;
  title: string;
  look: string;
}
export interface BattleStartMessage {
  wild: boolean;
  /** batalha contra treinador */
  trainer?: TrainerInfo;
  /** criaturas do time inimigo */
  foeCount: number;
  team: CreatureView[];
  active: number;
  foe: CreatureView;
  zone: string;
  /** batalha contra outro jogador (sem mochila; "Fugir" vira "Desistir") */
  pvp?: boolean;
}
export interface BattleTurnMessage {
  events: BattleEvent[];
  team: CreatureView[];
  active: number;
  foe: CreatureView;
  over: boolean;
  needSwitch: boolean;
  bag: Record<string, number>;
  /** batalha entre jogadores: esperando o outro escolher (texto para mostrar) */
  waiting?: string;
}
export interface DialogMessage {
  title: string;
  text: string;
}
export interface ShopMessage {
  /** loja da vila (compra e venda) ou mercador viajante (só compra) */
  shop: "loja" | "mercador";
  title: string;
  items: { id: string; name: string; description: string; price: number }[];
  money: number;
}
export interface GymOfferMessage {
  gymId: string;
  name: string;
  type: string;
  badge: string;
  level: number;
  leader: string;
  quote: string;
  trainers: number;
  hasBadge: boolean;
  badges: number;
}
export interface NoticeMessage {
  text: string;
}

// ---------------- Entre jogadores: batalha amistosa e troca ----------------

/** Distância máxima (em tiles) para desafiar ou propor troca. */
export const SOCIAL_RANGE = 6;
/** Tempo para responder a um pedido (ms). */
export const SOCIAL_REQUEST_MS = 30_000;
/** Tempo para escolher a ação no turno de uma batalha entre jogadores (ms). */
export const PVP_TURN_MS = 60_000;

export type SocialKind = "battle" | "trade";

/** cliente → servidor: "social_request" */
export interface SocialRequest {
  target: string;
  kind: SocialKind;
}
/** cliente → servidor: "social_answer" */
export interface SocialAnswer {
  from: string;
  accept: boolean;
}
/** servidor → cliente: alguém pediu batalha/troca */
export interface SocialRequestMessage {
  from: string;
  name: string;
  kind: SocialKind;
}

/** servidor → cliente: como está a troca */
export interface TradeStateMessage {
  partner: string;
  mine: CreatureView | null;
  theirs: CreatureView | null;
  /** quem capturou a criatura oferecida pelo outro */
  theirsCaughtBy: string | null;
  myOk: boolean;
  theirOk: boolean;
}
/** servidor → cliente: a troca acabou (feita ou cancelada) */
export interface TradeEndMessage {
  done: boolean;
  text: string;
}
