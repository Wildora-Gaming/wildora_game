// Armazenamento em arquivo JSON (desenvolvimento e testes): zero instalação.
// Também guarda as contas do modo local (nome + senha), que não usa e-mail.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BatchedStore, NameTakenError, nameKey, type Listing, type Trainer } from "./types";

interface LocalCredential {
  salt: string;
  hash: string;
}

interface FileShape {
  version: 2;
  trainers: (Trainer & { credential?: LocalCredential })[];
  market?: Listing[];
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 32).toString("hex");
}

export class FileStore extends BatchedStore {
  readonly label: string;
  private byId = new Map<string, Trainer>();
  private byKey = new Map<string, Trainer>();
  private credentials = new Map<string, LocalCredential>();
  private market = new Map<string, Listing>();

  constructor(private file: string, delayMs = 2000) {
    super(delayMs);
    this.label = `arquivo ${file}`;
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, "utf8")) as FileShape & { trainers: Record<string, unknown>[] };
      for (const raw of data.trainers ?? []) {
        const { credential, salt, hash, nameKey: _k, ...rest } = raw as Record<string, any>;
        const t = { badges: [], ...rest } as unknown as Trainer;
        this.index(t);
        const cred = credential ?? (salt && hash ? { salt, hash } : undefined); // formato antigo
        if (cred) this.credentials.set(t.id, cred);
      }
      for (const l of data.market ?? []) this.market.set(l.id, l);
    }
  }

  private index(t: Trainer) {
    this.byId.set(t.id, t);
    this.byKey.set(nameKey(t.name), t);
  }

  async count() {
    return this.byId.size;
  }

  async get(id: string) {
    return this.byId.get(id);
  }

  async nameTaken(name: string) {
    return this.byKey.has(nameKey(name));
  }

  async insert(t: Trainer) {
    if (this.byKey.has(nameKey(t.name))) throw new NameTakenError();
    this.index(t);
    this.writeFile();
  }

  async save(_t: Trainer) {
    // os objetos já estão na memória; grava o arquivo inteiro
    this.writeFile();
  }

  async close() {
    await this.flush();
  }

  // ---------- Mercado ----------

  async marketAll() {
    return [...this.market.values()];
  }

  async marketPut(l: Listing) {
    this.market.set(l.id, l);
    this.writeFile();
  }

  async marketDelete(id: string) {
    this.market.delete(id);
    this.writeFile();
  }

  // ---------- contas do modo local ----------

  findByName(name: string) {
    return this.byKey.get(nameKey(name));
  }

  setPassword(id: string, password: string) {
    const salt = randomBytes(16).toString("hex");
    this.credentials.set(id, { salt, hash: hashPassword(password, salt) });
    this.writeFile();
  }

  checkPassword(id: string, password: string) {
    const cred = this.credentials.get(id);
    if (!cred) return false;
    const a = Buffer.from(hashPassword(password, cred.salt), "hex");
    const b = Buffer.from(cred.hash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private writeFile() {
    mkdirSync(dirname(this.file), { recursive: true });
    const data: FileShape = {
      version: 2,
      trainers: [...this.byId.values()].map((t) => ({ ...t, credential: this.credentials.get(t.id) })),
      market: [...this.market.values()],
    };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, this.file);
  }
}
