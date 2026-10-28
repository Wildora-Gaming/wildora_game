// Progresso no Postgres (Supabase), em tabelas: treinador, criaturas, mochila, dex, insígnias.
// Esquema em supabase/schema.sql.
import type { Creature } from "../../../shared/battle/engine";
import type { StatusId } from "../../../shared/battle/data";
import type { Db } from "./db";
import { BatchedStore, NameTakenError, nameKey, type Trainer } from "./types";

interface TrainerRow {
  id: string;
  name: string;
  look: string;
  x: number;
  y: number;
  dir: string;
  money: number;
  wins: number;
  caught: number;
  created_at: Date | string;
  last_seen: Date | string;
}

interface CreatureRow {
  id: string;
  species_id: string;
  level: number;
  xp: number;
  hp: number;
  status: string | null;
  status_turns: number;
  moves: string[];
  location: "team" | "box";
  slot: number;
  caught_by: string | null;
  caught_at: Date | string;
  caught_zone: string | null;
}

const time = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : Date.now());
const iso = (ms: number | undefined) => new Date(ms ?? Date.now()).toISOString();

export class PgStore extends BatchedStore {
  readonly label = "Postgres (Supabase)";

  constructor(private db: Db, delayMs = 3000) {
    super(delayMs);
  }

  async count() {
    const r = await this.db.query<{ n: number | string }>("select count(*)::int as n from public.trainers");
    return Number(r.rows[0]?.n ?? 0);
  }

  async nameTaken(name: string) {
    const r = await this.db.query("select 1 from public.trainers where name_key = $1", [nameKey(name)]);
    return r.rows.length > 0;
  }

  async get(id: string): Promise<Trainer | undefined> {
    const tr = await this.db.query<TrainerRow>("select * from public.trainers where id = $1", [id]);
    const row = tr.rows[0];
    if (!row) return undefined;
    const [cr, inv, dex, badges] = await Promise.all([
      this.db.query<CreatureRow>("select * from public.creatures where owner_id = $1 order by location desc, slot", [id]),
      this.db.query<{ item_id: string; qty: number }>("select item_id, qty from public.inventory where owner_id = $1", [id]),
      this.db.query<{ species_id: string; caught_at: string | null }>(
        "select species_id, caught_at from public.dex where owner_id = $1",
        [id],
      ),
      this.db.query<{ gym_id: string }>("select gym_id from public.badges where owner_id = $1 order by earned_at", [id]),
    ]);
    const toCreature = (c: CreatureRow): Creature => ({
      uid: c.id,
      speciesId: c.species_id,
      level: c.level,
      xp: c.xp,
      hp: c.hp,
      status: (c.status as StatusId | null) ?? null,
      statusTurns: c.status_turns,
      moves: [...c.moves],
      caughtBy: c.caught_by ?? undefined,
      caughtAt: time(c.caught_at),
      caughtZone: c.caught_zone ?? undefined,
    });
    return {
      id: row.id,
      name: row.name,
      look: row.look,
      x: row.x,
      y: row.y,
      dir: row.dir,
      money: row.money,
      bag: Object.fromEntries(inv.rows.map((r) => [r.item_id, r.qty])),
      team: cr.rows.filter((c) => c.location === "team").map(toCreature),
      box: cr.rows.filter((c) => c.location === "box").map(toCreature),
      dex: {
        seen: dex.rows.map((d) => d.species_id),
        caught: dex.rows.filter((d) => d.caught_at).map((d) => d.species_id),
      },
      stats: { wins: row.wins, caught: row.caught },
      badges: badges.rows.map((b) => b.gym_id),
      createdAt: time(row.created_at),
      lastSeen: time(row.last_seen),
    };
  }

  async insert(t: Trainer) {
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          `insert into public.trainers (id, name, name_key, look, x, y, dir, money, wins, caught, created_at, last_seen)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [t.id, t.name, nameKey(t.name), t.look, t.x, t.y, t.dir, t.money, t.stats.wins, t.stats.caught, iso(t.createdAt), iso(t.lastSeen)],
        );
        await this.writeDetails(tx, t);
      });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new NameTakenError();
      throw err;
    }
  }

  async save(t: Trainer) {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `update public.trainers set look=$2, x=$3, y=$4, dir=$5, money=$6, wins=$7, caught=$8, last_seen=$9
         where id=$1`,
        [t.id, t.look, t.x, t.y, t.dir, t.money, t.stats.wins, t.stats.caught, iso(t.lastSeen)],
      );
      await this.writeDetails(tx, t);
    });
  }

  /** Criaturas, mochila, dex e insígnias. */
  private async writeDetails(tx: Db, t: Trainer) {
    const all: [Creature, "team" | "box", number][] = [
      ...t.team.map((c, i): [Creature, "team", number] => [c, "team", i]),
      ...t.box.map((c, i): [Creature, "box", number] => [c, "box", i]),
    ];
    for (const [c, location, slot] of all) {
      await tx.query(
        `insert into public.creatures
           (id, owner_id, species_id, level, xp, hp, status, status_turns, moves, location, slot, caught_by, caught_at, caught_zone, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         on conflict (id) do update set
           owner_id=excluded.owner_id, species_id=excluded.species_id, level=excluded.level, xp=excluded.xp,
           hp=excluded.hp, status=excluded.status, status_turns=excluded.status_turns, moves=excluded.moves,
           location=excluded.location, slot=excluded.slot, updated_at=now()`,
        [
          c.uid,
          t.id,
          c.speciesId,
          c.level,
          c.xp,
          c.hp,
          c.status,
          c.statusTurns,
          c.moves,
          location,
          slot,
          c.caughtBy ?? t.id,
          iso(c.caughtAt),
          c.caughtZone ?? null,
        ],
      );
    }
    await tx.query("delete from public.creatures where owner_id = $1 and not (id = any($2::text[]))", [
      t.id,
      all.map(([c]) => c.uid),
    ]);

    await tx.query("delete from public.inventory where owner_id = $1", [t.id]);
    for (const [item, qty] of Object.entries(t.bag)) {
      if (qty > 0) await tx.query("insert into public.inventory (owner_id, item_id, qty) values ($1,$2,$3)", [t.id, item, qty]);
    }

    for (const species of t.dex.seen) {
      const caught = t.dex.caught.includes(species);
      await tx.query(
        `insert into public.dex (owner_id, species_id, caught_at) values ($1,$2,$3)
         on conflict (owner_id, species_id) do update set caught_at = coalesce(public.dex.caught_at, excluded.caught_at)`,
        [t.id, species, caught ? new Date().toISOString() : null],
      );
    }

    for (const gym of t.badges) {
      await tx.query("insert into public.badges (owner_id, gym_id) values ($1,$2) on conflict do nothing", [t.id, gym]);
    }
  }

  async close() {
    await this.flush();
    await this.db.end();
  }
}
