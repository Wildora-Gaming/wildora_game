// Armazenamento das contas e do progresso.
// Um arquivo JSON com escrita atômica (grava num temporário e renomeia): funciona em qualquer
// máquina sem instalar banco de dados. A interface é pequena de propósito, para trocar por
// Postgres mais tarde sem mexer na sala do jogo.
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Creature } from "../../shared/battle/engine";

export interface Trainer {
  id: string;
  name: string;
  /** nome normalizado, usado para login e para impedir nomes repetidos */
  nameKey: string;
  salt: string;
  hash: string;
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
  createdAt: number;
  lastSeen: number;
}

interface FileShape {
  version: 1;
  trainers: Trainer[];
}

export function nameKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString("hex");
}

export class Store {
  private byId = new Map<string, Trainer>();
  private byKey = new Map<string, Trainer>();
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string) {
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, "utf8")) as FileShape;
      for (const t of data.trainers ?? []) this.index(t);
    }
  }

  private index(t: Trainer) {
    this.byId.set(t.id, t);
    this.byKey.set(t.nameKey, t);
  }

  get size() {
    return this.byId.size;
  }

  findByName(name: string): Trainer | undefined {
    return this.byKey.get(nameKey(name));
  }

  create(name: string, password: string, init: Omit<Trainer, "id" | "name" | "nameKey" | "salt" | "hash" | "createdAt" | "lastSeen">) {
    const salt = randomBytes(16).toString("hex");
    const t: Trainer = {
      id: randomUUID(),
      name,
      nameKey: nameKey(name),
      salt,
      hash: hashPassword(password, salt),
      createdAt: Date.now(),
      lastSeen: Date.now(),
      ...init,
    };
    this.index(t);
    this.markDirty();
    return t;
  }

  checkPassword(t: Trainer, password: string) {
    const a = Buffer.from(hashPassword(password, t.salt), "hex");
    const b = Buffer.from(t.hash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Marca para gravar em breve (agrupa várias mudanças numa escrita). */
  markDirty() {
    this.dirty = true;
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 2000);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    mkdirSync(dirname(this.file), { recursive: true });
    const data: FileShape = { version: 1, trainers: [...this.byId.values()] };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, this.file);
  }
}
