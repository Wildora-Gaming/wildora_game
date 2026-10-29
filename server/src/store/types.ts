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
