// Armazenamento do progresso: a sala do jogo só conhece esta interface.
// Implementações: FileStore (arquivo JSON, desenvolvimento) e PgStore (Postgres/Supabase).
import type { Creature } from "../../../shared/battle/engine";

export interface Trainer {
  /** id da conta (no Supabase, o mesmo id do usuário) */
  id: string;
  name: string;
  look: string;
  x: number;
  y: number;
  dir: string;
  money: number;
  bag: Record<string, number>;
  team: Creature[];
  box: Creature[];
  dex: { seen: string[]; caught: string[] };
  stats: { wins: number; caught: number };
  /** ids dos ginásios vencidos */
  badges: string[];
  createdAt: number;
  lastSeen: number;
  /** versão do mundo em que x/y foram salvos (ver WORLD_VERSION); sem valor = mundo 1 */
  world?: number;
  /** missões, trocas com NPCs e desafios do dia */
  progress?: Progress;
}

export interface Progress {
  /** missões: etapa atual de cada NPC e contagem da tarefa em andamento */
  quests?: Record<string, { step: number; count: number }>;
  /** trocas com NPCs já feitas */
  npcTrades?: string[];
  /** treinadores da estrada: dia (desde 1970) da última vitória */
  roadWins?: Record<string, number>;
  /** Centros/Postos de Cura já visitados (viagem rápida) */
  visited?: string[];
  /** amigos (id e nome) */
  friends?: { id: string; name: string }[];
}

/** Linha do ranking. */
export interface RankRow {
  id: string;
  name: string;
  badges: number;
  /** espécies capturadas (Livro de Criaturas) */
  caught: number;
  wins: number;
  /** espécies lendárias que tem (time ou caixa) */
  legends: number;
}

export const LEGEND_IDS = ["solvaris", "nocteon", "abyssion", "terralith"];

/** Ranking a partir dos treinadores na memória (FileStore e jogadores online). */
export function rankRow(t: Trainer): RankRow {
  const own = new Set([...t.team, ...t.box].map((c) => c.speciesId));
  return {
    id: t.id,
    name: t.name,
    badges: t.badges.length,
    caught: t.dex.caught.length,
    wins: t.stats.wins,
    legends: LEGEND_IDS.filter((id) => own.has(id)).length,
  };
}

/** Oferta no Mercado entre jogadores. */
export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  /** criatura ou item à venda */
  creature?: Creature;
  itemId?: string;
  qty?: number;
  price: number;
  createdAt: number;
  /** vendida: comprador e se o vendedor já recebeu as Sementes */
  buyerName?: string;
  soldAt?: number;
}

/**
 * No Postgres a versão do mundo vai junto da coluna x (x + 1000 × versão), sem mudar o esquema.
 * Linhas antigas (x < 1000) são do mundo 1.
 */
export function encodeX(t: Trainer) {
  const w = t.world ?? 1;
  return w >= 2 ? t.x + w * 1000 : t.x;
}
export function decodeX(raw: number): { x: number; world: number } {
  return raw >= 1000 ? { x: raw % 1000, world: Math.floor(raw / 1000) } : { x: raw, world: 1 };
}

export class NameTakenError extends Error {
  constructor() {
    super("Esse nome já está em uso. Escolha outro.");
  }
}

export interface Store {
  /** descrição para o log */
  readonly label: string;
  count(): Promise<number>;
  get(id: string): Promise<Trainer | undefined>;
  nameTaken(name: string): Promise<boolean>;
  /** cria o treinador; lança NameTakenError se o nome já existe */
  insert(t: Trainer): Promise<void>;
  /** grava o estado completo do treinador */
  save(t: Trainer): Promise<void>;
  /** agenda gravação (agrupa várias mudanças) */
  markDirty(t: Trainer): void;
  /** grava tudo que está pendente */
  flush(): Promise<void>;
  close(): Promise<void>;
  /** Mercado: todas as ofertas (abertas e vendidas ainda não recebidas) */
  marketAll(): Promise<Listing[]>;
  /** cria ou atualiza uma oferta */
  marketPut(l: Listing): Promise<void>;
  marketDelete(id: string): Promise<void>;
  /** todos os treinadores, para o ranking */
  ranking(): Promise<RankRow[]>;
}

/** Nome sem acento, minúsculo e com espaços normalizados: impede "Ana" e "aná" ao mesmo tempo. */
export function nameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Base com gravação agrupada: markDirty junta mudanças e grava a cada poucos segundos. */
export abstract class BatchedStore implements Store {
  abstract readonly label: string;
  private dirty = new Map<string, Trainer>();
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> = Promise.resolve();

  constructor(private delayMs = 3000) {}

  abstract count(): Promise<number>;
  abstract get(id: string): Promise<Trainer | undefined>;
  abstract nameTaken(name: string): Promise<boolean>;
  abstract insert(t: Trainer): Promise<void>;
  abstract save(t: Trainer): Promise<void>;
  abstract close(): Promise<void>;
  abstract marketAll(): Promise<Listing[]>;
  abstract marketPut(l: Listing): Promise<void>;
  abstract marketDelete(id: string): Promise<void>;
  abstract ranking(): Promise<RankRow[]>;

  markDirty(t: Trainer) {
    this.dirty.set(t.id, t);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = [...this.dirty.values()];
    this.dirty.clear();
    this.flushing = this.flushing.then(async () => {
      for (const t of batch) {
        try {
          await this.save(t);
        } catch (err) {
          console.error(`[store] falha ao salvar ${t.name}:`, err);
          this.markDirty(t); // tenta de novo na próxima rodada
        }
      }
    });
    return this.flushing;
  }
}
