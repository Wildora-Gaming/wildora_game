// Progresso no Postgres (Supabase), em tabelas: treinador, criaturas, mochila, dex, insígnias.
// Esquema em supabase/schema.sql.
import type { Creature } from "../../../shared/battle/engine";
import type { StatusId } from "../../../shared/battle/data";
import type { Db } from "./db";
import { BatchedStore, NameTakenError, decodeX, encodeX, nameKey, type Trainer } from "./types";

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

  /**
   * Ajustes no esquema de bancos criados antes (rodam a cada início e podem repetir).
   * - criaturas: nível até 150 (lendários).
   */
  async migrate() {
    try {
      await this.db.query(`alter table public.creatures drop constraint if exists creatures_level_check`);
      await this.db.query(`alter table public.creatures add constraint creatures_level_check check (level between 1 and 150)`);
    } catch (err) {
      console.error("[store] não consegui atualizar o limite de nível no banco (rode supabase/schema.sql):", err);
    }
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
      x: decodeX(row.x).x,
      world: decodeX(row.x).world,
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
          [t.id, t.name, nameKey(t.name), t.look, encodeX(t), t.y, t.dir, t.money, t.stats.wins, t.stats.caught, iso(t.createdAt), iso(t.lastSeen)],
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
        [t.id, t.look, encodeX(t), t.y, t.dir, t.money, t.stats.wins, t.stats.caught, iso(t.lastSeen)],
      );
      await this.writeDetails(tx, t);
    });
  }

  /**
   * Criaturas, mochila, dex e insígnias. Poucas consultas por salvamento (cada uma leva uma ida
   * e volta até o banco), mandando as listas inteiras como JSON.
   */
  private async writeDetails(tx: Db, t: Trainer) {
    const creatures = [
      ...t.team.map((c, slot) => ({ c, location: "team", slot })),
      ...t.box.map((c, slot) => ({ c, location: "box", slot })),
    ].map(({ c, location, slot }) => ({
      id: c.uid,
      species_id: c.speciesId,
      level: c.level,
      xp: c.xp,
      hp: c.hp,
      status: c.status,
      status_turns: c.statusTurns,
      moves: c.moves,
      location,
      slot,
      caught_by: c.caughtBy ?? t.id,
      caught_at: iso(c.caughtAt),
      caught_zone: c.caughtZone ?? null,
    }));
    await tx.query("delete from public.creatures where owner_id = $1 and not (id = any($2::text[]))", [
      t.id,
      creatures.map((c) => c.id),
    ]);
    if (creatures.length) {
      await tx.query(
        `insert into public.creatures
           (id, owner_id, species_id, level, xp, hp, status, status_turns, moves, location, slot, caught_by, caught_at, caught_zone, updated_at)
         select c.id, $1, c.species_id, c.level, c.xp, c.hp, c.status, c.status_turns, c.moves, c.location, c.slot,
                c.caught_by, c.caught_at, c.caught_zone, now()
           from jsonb_to_recordset($2::jsonb) as c(
             id text, species_id text, level int, xp int, hp int, status text, status_turns int, moves text[],
             location text, slot int, caught_by uuid, caught_at timestamptz, caught_zone text)
         on conflict (id) do update set
           owner_id=excluded.owner_id, species_id=excluded.species_id, level=excluded.level, xp=excluded.xp,
           hp=excluded.hp, status=excluded.status, status_turns=excluded.status_turns, moves=excluded.moves,
           location=excluded.location, slot=excluded.slot, updated_at=now()`,
        [t.id, JSON.stringify(creatures)],
      );
    }

    const bag = Object.fromEntries(Object.entries(t.bag).filter(([, qty]) => qty > 0));
    await tx.query("delete from public.inventory where owner_id = $1", [t.id]);
    await tx.query(
      `insert into public.inventory (owner_id, item_id, qty)
       select $1, key, value::int from jsonb_each_text($2::jsonb)`,
      [t.id, JSON.stringify(bag)],
    );

    const now = new Date().toISOString();
    const dex = t.dex.seen.map((species) => ({ species_id: species, caught_at: t.dex.caught.includes(species) ? now : null }));
    await tx.query(
      `insert into public.dex (owner_id, species_id, caught_at)
       select $1, d.species_id, d.caught_at from jsonb_to_recordset($2::jsonb) as d(species_id text, caught_at timestamptz)
       on conflict (owner_id, species_id) do update set caught_at = coalesce(public.dex.caught_at, excluded.caught_at)`,
      [t.id, JSON.stringify(dex)],
    );

    await tx.query(
      `insert into public.badges (owner_id, gym_id) select $1, unnest($2::text[]) on conflict do nothing`,
      [t.id, t.badges],
    );
  }

  async close() {
    await this.flush();
    await this.db.end();
  }
}
