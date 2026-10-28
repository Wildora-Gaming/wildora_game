// Modo Supabase de ponta a ponta, sem internet:
// - Postgres de verdade em memória (PGlite) com o supabase/schema.sql
// - um servidor falso que responde como o /auth/v1/user do Supabase
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { WorldRoom } from "../src/rooms/WorldRoom";
import { PgStore } from "../src/store/pg-store";
import { supabaseAuth } from "../src/auth";
import type { Db } from "../src/store/db";
import type { Trainer } from "../src/store/types";
import { ROOM_NAME } from "../../shared/constants";
import { createCreature } from "../../shared/battle/engine";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 2596;
const AUTH_PORT = 2597;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const ok = (label: string) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

async function waitFor(cond: () => boolean, label: string, timeout = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout esperando: ${label}`);
    await sleep(20);
  }
}

function pgliteDb(pg: PGlite | Parameters<Parameters<PGlite["transaction"]>[0]>[0]): Db {
  return {
    query: async (sql, params) => ({ rows: (await pg.query(sql, params as any[])).rows as any[] }),
    transaction: async (fn) => (pg as PGlite).transaction((tx) => fn(pgliteDb(tx))),
    end: async () => {},
  };
}

// usuários "cadastrados" no Supabase falso
const USERS: Record<string, { id: string; email: string; confirmed: boolean }> = {
  "token-ana-0000000000000000": { id: "11111111-1111-4111-8111-111111111111", email: "ana@exemplo.com", confirmed: true },
  "token-beto-000000000000000": { id: "22222222-2222-4222-8222-222222222222", email: "beto@exemplo.com", confirmed: true },
  "token-novo-000000000000000": { id: "33333333-3333-4333-8333-333333333333", email: "novo@exemplo.com", confirmed: false },
};

async function main() {
  console.log("Modo Supabase (Postgres + login por e-mail)");

  // ---------- banco ----------
  const pg = new PGlite();
  await pg.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
  `);
  await pg.exec(readFileSync(resolve(here, "../../supabase/schema.sql"), "utf8"));
  await pg.exec(readFileSync(resolve(here, "../../supabase/schema.sql"), "utf8")); // rodar de novo não quebra
  for (const u of Object.values(USERS)) await pg.query("insert into auth.users (id) values ($1)", [u.id]);
  ok("schema.sql roda no Postgres (e pode rodar de novo)");

  const db = pgliteDb(pg);
  const store = new PgStore(db, 100);

  // ---------- ida e volta direto no armazenamento ----------
  const sample: Trainer = {
    id: USERS["token-beto-000000000000000"].id,
    name: "Beto",
    look: "1.0.0.0.0.1.0.0.6.11.0.0",
    x: 10,
    y: 20,
    dir: "left",
    money: 777,
    bag: { orbi: 3, pocao: 1 },
    team: [createCreature("leafin", 12), createCreature("zappi", 8)],
    box: [createCreature("rocky", 5)],
    dex: { seen: ["leafin", "zappi", "rocky", "pawly"], caught: ["leafin", "zappi", "rocky"] },
    stats: { wins: 4, caught: 2 },
    badges: ["fera"],
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
  sample.team[0].hp = 7;
  sample.team[0].status = "queimado";
  sample.team[1].caughtZone = "Campina Norte";
  await store.insert(sample);
  const back = await store.get(sample.id);
  assert.ok(back);
  assert.equal(back.money, 777);
  assert.deepEqual(back.bag, { orbi: 3, pocao: 1 });
  assert.deepEqual(back.team.map((c) => [c.speciesId, c.level, c.hp, c.status]), [
    ["leafin", 12, 7, "queimado"],
    ["zappi", 8, back.team[1].hp, null],
  ]);
  assert.deepEqual(back.team[0].moves, sample.team[0].moves);
  assert.equal(back.team[1].caughtZone, "Campina Norte");
  assert.equal(back.box[0].speciesId, "rocky");
  assert.deepEqual(back.dex.caught.sort(), ["leafin", "rocky", "zappi"]);
  assert.deepEqual(back.dex.seen.length, 4);
  assert.deepEqual(back.badges, ["fera"]);
  ok("treinador, criaturas (time e caixa), mochila, dex e insígnias vão e voltam do banco");

  // mudanças: soltar a criatura da caixa, gastar itens, nova insígnia
  back.box = [];
  back.bag = { orbi: 1 };
  back.badges.push("flora");
  back.team[0].level = 13;
  await store.save(back);
  const again = await store.get(sample.id);
  assert.equal(again!.box.length, 0);
  assert.deepEqual(again!.bag, { orbi: 1 });
  assert.deepEqual(again!.badges, ["fera", "flora"]);
  assert.equal(again!.team[0].level, 13);
  const rows = await db.query<{ n: number }>("select count(*)::int as n from public.creatures where owner_id = $1", [sample.id]);
  assert.equal(Number(rows.rows[0].n), 2);
  ok("salvar de novo atualiza nível, remove criatura solta e item gasto");

  await assert.rejects(() => store.insert({ ...sample, id: USERS["token-ana-0000000000000000"].id, name: "bêto" }), /já está em uso/);
  ok("nome repetido barrado pelo banco (sem acento e sem maiúscula)");
  await db.query("delete from public.trainers where id = $1", [sample.id]);

  // ---------- servidor de login falso ----------
  const authServer = createServer((req, res) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const u = USERS[token];
    if (req.url !== "/auth/v1/user" || !u || req.headers.apikey !== "anon-key") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ msg: "invalid JWT" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: u.id, email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null }));
  });
  await new Promise<void>((r) => authServer.listen(AUTH_PORT, r));

  WorldRoom.store = store;
  WorldRoom.local = null;
  WorldRoom.auth = supabaseAuth(`http://localhost:${AUTH_PORT}`, "anon-key");
  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define(ROOM_NAME, WorldRoom);
  await gameServer.listen(PORT);
  const URL = `ws://localhost:${PORT}`;

  const fails = async (options: Record<string, unknown>) => {
    try {
      const r = await new Client(URL).joinOrCreate(ROOM_NAME, options);
      await r.leave();
      return "";
    } catch (err) {
      return (err as Error).message;
    }
  };

  assert.match(await fails({ token: "token-falso-00000000000000" }), /Sessão/);
  assert.match(await fails({ token: "token-novo-000000000000000" }), /Confirme seu e-mail/);
  assert.match(await fails({ mode: "login", name: "Ana", password: "1234" }), /Sessão/);
  ok("token falso, e-mail não confirmado e login local são recusados");

  assert.match(await fails({ token: "token-ana-0000000000000000" }), /SEM_PERSONAGEM/);
  ok("conta nova sem personagem pede a criação");

  const profiles: any[] = [];
  const ana = await new Client(URL).joinOrCreate(ROOM_NAME, {
    token: "token-ana-0000000000000000",
    create: { name: "Ana", look: "3.4.4.1.2.2.5.2.3.9.2.7", starter: "aquari" },
  });
  ana.onMessage("profile", (m) => profiles.push(m));
  for (const t of ["battle_start", "battle_turn", "chat", "dialog", "notice"]) ana.onMessage(t, () => {});
  await waitFor(() => profiles.length > 0, "perfil");
  assert.equal(profiles[0].name, "Ana");
  assert.equal(profiles[0].team[0].speciesId, "aquari");
  ok("criação do personagem grava no banco e entra no mundo");

  assert.match(
    await fails({ token: "token-beto-000000000000000", create: { name: "ana", look: "", starter: "leafin" } }),
    /já está em uso/,
  );
  assert.match(await fails({ token: "token-ana-0000000000000000" }), /já está conectada/);
  ok("nome de treinador repetido e login duplo barrados");

  // muda o progresso no servidor e sai: precisa ir para o banco
  const room = matchMaker.getLocalRoomById(ana.roomId) as WorldRoom;
  const session = (room as any).sessions.get(ana.sessionId);
  const caught = createCreature("chirpy", 4);
  caught.caughtBy = session.trainer.id;
  caught.caughtZone = "Campina Norte";
  session.trainer.team.push(caught);
  session.trainer.bag.orbi = 2;
  session.trainer.badges.push("fera");
  session.trainer.dex.seen.push("chirpy");
  session.trainer.dex.caught.push("chirpy");
  await ana.leave();
  await sleep(400);

  const cr = await db.query<{ species_id: string; caught_by: string; caught_zone: string; location: string; slot: number }>(
    "select species_id, caught_by, caught_zone, location, slot from public.creatures where owner_id = $1 order by slot",
    [USERS["token-ana-0000000000000000"].id],
  );
  assert.deepEqual(
    cr.rows.map((r) => [r.species_id, r.location, r.slot]),
    [
      ["aquari", "team", 0],
      ["chirpy", "team", 1],
    ],
  );
  assert.equal(cr.rows[1].caught_by, USERS["token-ana-0000000000000000"].id);
  assert.equal(cr.rows[1].caught_zone, "Campina Norte");
  assert.equal(cr.rows[0].caught_zone, "Vila Broto");
  const inv = await db.query<{ item_id: string; qty: number }>("select item_id, qty from public.inventory where owner_id = $1 order by item_id", [
    USERS["token-ana-0000000000000000"].id,
  ]);
  assert.deepEqual(inv.rows.map((r) => [r.item_id, r.qty]), [
    ["orbi", 2],
    ["pocao", 3],
  ]);
  const badges = await db.query("select gym_id from public.badges where owner_id = $1", [USERS["token-ana-0000000000000000"].id]);
  assert.equal(badges.rows.length, 1);
  ok("ao sair, criaturas (com quem capturou e onde), itens e insígnias estão nas tabelas");

  const profiles2: any[] = [];
  const ana2 = await new Client(URL).joinOrCreate(ROOM_NAME, { token: "token-ana-0000000000000000" });
  ana2.onMessage("profile", (m) => profiles2.push(m));
  for (const t of ["battle_start", "battle_turn", "chat", "dialog", "notice"]) ana2.onMessage(t, () => {});
  await waitFor(() => profiles2.length > 0, "perfil de volta");
  assert.deepEqual(profiles2[0].team.map((c: any) => c.speciesId), ["aquari", "chirpy"]);
  assert.deepEqual(profiles2[0].badges, ["fera"]);
  await ana2.leave();
  ok("entrar de novo devolve o progresso salvo");

  await gameServer.gracefullyShutdown(false);
  authServer.close();
  await pg.close();
  console.log(`\n${passed} verificações passaram.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFALHOU:", err);
  process.exit(1);
});
