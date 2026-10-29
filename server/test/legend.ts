// Expansão do leste (biomas novos) e evento dos lendários.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client } from "colyseus.js";
import { WorldRoom } from "../src/rooms/WorldRoom";
import { FileStore } from "../src/store/file-store";
import { decodeX, encodeX } from "../src/store/types";
import { ROOM_NAME } from "../../shared/constants";
import { BIOMES, WORLD_VERSION, LEGEND_SPOTS, MAP_HEIGHT, MAP_OBJECTS, MAP_WIDTH, SPAWN, doorOf, isWalkable, isWildTile, tileAt, findPath } from "../../shared/map";
import { GYMS } from "../../shared/gyms";
import { ZONES, areaName, zoneAt } from "../../shared/creatures";
import { SPECIES } from "../../shared/battle/data";

const PORT = 2604;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (l: string) => {
  passed++;
  console.log(`  ✓ ${l}`);
};
async function waitFor(cond: () => boolean, label: string, timeout = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout esperando: ${label}`);
    await sleep(20);
  }
}

async function main() {
  console.log("Mundo, biomas e lendários");

  // ---------- Mapa ----------
  for (const [id, spot] of Object.entries(LEGEND_SPOTS)) {
    assert.ok(SPECIES[id], `${id} existe`);
    assert.ok(isWalkable(spot.x, spot.y), `clareira de ${id} livre`);
    assert.ok(!isWildTile(tileAt(spot.x, spot.y)), `clareira de ${id} sem grama alta`);
    assert.ok(findPath(SPAWN, (x, y) => x === spot.x && y === spot.y), `dá para chegar em ${id}`);
    assert.equal(zoneAt(spot.x, spot.y).name, spot.region);
  }
  // alcance a partir da vila (uma busca só)
  const reach = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  const q = [SPAWN.y * MAP_WIDTH + SPAWN.x];
  reach[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % MAP_WIDTH;
    const y = (q[i] - x) / MAP_WIDTH;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (y + dy) * MAP_WIDTH + x + dx;
      if (isWalkable(x + dx, y + dy) && !reach[n]) {
        reach[n] = 1;
        q.push(n);
      }
    }
  }
  const counts: Record<string, number> = {};
  for (let y = 0; y < MAP_HEIGHT; y++)
    for (let x = 0; x < MAP_WIDTH; x++)
      if (isWildTile(tileAt(x, y)) && reach[y * MAP_WIDTH + x]) counts[zoneAt(x, y).id] = (counts[zoneAt(x, y).id] ?? 0) + 1;
  for (const b of BIOMES) {
    assert.ok((counts[b.id] ?? 0) > 300, `${b.name} tem grama alta alcançável (${counts[b.id]})`);
    assert.ok(ZONES[b.id], `${b.id} tem tabela de criaturas`);
    for (const e of ZONES[b.id].table) assert.ok(SPECIES[e.speciesId], `${e.speciesId} existe`);
  }
  // cada ginásio no seu canto, com Posto de Cura, ambos alcançáveis
  for (const gym of GYMS) {
    const g = MAP_OBJECTS.find((o) => o.kind === "gym" && o.gymId === gym.id)!;
    const d = doorOf(g);
    assert.ok(reach[(d.y + 1) * MAP_WIDTH + d.x], `porta do ${gym.name} alcançável`);
    const heal = MAP_OBJECTS.find((o) => o.role === "heal" && Math.abs(o.x - g.x) < 14 && Math.abs(o.y - g.y) < 6)!;
    assert.ok(heal, `Posto de Cura perto do ${gym.name}`);
    const hd = doorOf(heal);
    assert.ok(reach[(hd.y + 1) * MAP_WIDTH + hd.x], `Posto de Cura do ${gym.name} alcançável`);
  }
  assert.equal(areaName(SPAWN.x, SPAWN.y), "Vila Broto");
  assert.equal(areaName(LEGEND_SPOTS.solvaris.x, LEGEND_SPOTS.solvaris.y), "Planície Gelada");
  ok("oito biomas com grama alta alcançável, oito ginásios com Posto de Cura e clareiras dos lendários livres");

  // ---------- Evento ----------
  const store = new FileStore(joinPath(mkdtempSync(joinPath(tmpdir(), "wildora-legend-")), "save.json"), 100);
  WorldRoom.store = store;
  WorldRoom.local = store;
  const server = new Server({ transport: new WebSocketTransport() });
  server.define(ROOM_NAME, WorldRoom);
  await server.listen(PORT);

  const join = async (name: string) => {
    const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, { mode: "register", name, password: "senha123", starter: "aquari" });
    const inbox: Record<string, any[]> = { chat: [], notice: [], battle_start: [], battle_turn: [], profile: [] };
    for (const t of Object.keys(inbox)) room.onMessage(t, (m) => inbox[t].push(m));
    for (const t of ["dialog", "shop"]) room.onMessage(t, () => {});
    await waitFor(() => inbox.profile.length > 0, "perfil");
    return { room, inbox };
  };
  const a = await join("Lia");
  const b = await join("Rui");
  const world = matchMaker.getLocalRoomById(a.room.roomId) as WorldRoom;
  world.rng = () => 0;

  world.spawnLegend("solvaris");
  const spot = LEGEND_SPOTS.solvaris;
  await waitFor(() => a.inbox.chat.some((m) => m.system && /Solvaris .*na Planície Gelada/.test(m.text)), "anúncio no chat");
  await waitFor(() => (a.room.state as any).legend?.speciesId === "solvaris", "lendário no estado");
  const legend = (a.room.state as any).legend;
  assert.equal(legend.x, spot.x);
  assert.equal(legend.y, spot.y);
  ok("lendário aparece na clareira do bioma, com aviso no chat para todos");

  // chega no lendário: batalha selvagem nível 45-50
  const pa = world.state.players.get(a.room.sessionId)!;
  pa.x = spot.x - 1;
  pa.y = spot.y;
  a.room.send("move", { dir: "right", seq: 1 });
  await waitFor(() => a.inbox.battle_start.length === 1, "batalha com o lendário");
  const start = a.inbox.battle_start[0];
  assert.equal(start.foe.speciesId, "solvaris");
  assert.ok(start.foe.level >= 45 && start.foe.level <= 50);
  await waitFor(() => legend.busy === true, "ocupado");

  // segundo jogador espera a vez
  const pb = world.state.players.get(b.room.sessionId)!;
  pb.x = spot.x;
  pb.y = spot.y + 1;
  b.room.send("move", { dir: "up", seq: 1 });
  await waitFor(() => b.inbox.notice.some((n) => /Lia já está enfrentando Solvaris/.test(n.text)), "aviso de ocupado");
  assert.equal(b.inbox.battle_start.length, 0);
  ok("o primeiro a chegar enfrenta; quem chega depois espera a vez");

  // fugiu: o lendário continua lá para o próximo
  await sleep(350);
  a.room.send("battle_action", { kind: "run" });
  await waitFor(() => a.inbox.battle_turn.length === 1 && a.inbox.battle_turn[0].over, "fugiu");
  await waitFor(() => legend.busy === false, "livre de novo");
  assert.equal(legend.speciesId, "solvaris");
  ok("fugir deixa o lendário livre para outro treinador");

  // o segundo tenta e captura (rng 0: a esfera sempre pega)
  const t = (world as any).sessions.get(b.room.sessionId).trainer;
  t.bag.orbi = 5;
  pb.x = spot.x;
  pb.y = spot.y + 1;
  b.room.send("move", { dir: "up", seq: 2 });
  await waitFor(() => b.inbox.battle_start.length === 1, "batalha do Rui");
  await sleep(350);
  const orb = "orbi";
  b.room.send("battle_action", { kind: "item", itemId: orb });
  await waitFor(() => b.inbox.battle_turn.some((m) => m.over), "fim da batalha");
  await waitFor(() => a.inbox.chat.some((m) => m.system && /Rui capturou o lendário Solvaris/.test(m.text)), "anúncio da captura");
  await waitFor(() => legend.speciesId === "", "sumiu do mapa");
  assert.ok(t.team.some((c: any) => c.speciesId === "solvaris") || t.box.some((c: any) => c.speciesId === "solvaris"));
  ok("captura o lendário: vai para o time, todo mundo fica sabendo e ele some do mapa");

  // ---------- Quem foi salvo no mundo antigo volta para a Vila Broto ----------
  assert.deepEqual(decodeX(encodeX({ x: 200, world: 2 } as any)), { x: 200, world: 2 });
  assert.deepEqual(decodeX(47), { x: 47, world: 1 });
  const old = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, { mode: "register", name: "Velho", password: "senha123", starter: "flambo" });
  await sleep(150);
  await old.leave();
  await sleep(250);
  const saved = store.findByName("Velho")!;
  saved.x = 60;
  saved.y = 20;
  delete saved.world;
  const back = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, { mode: "login", name: "Velho", password: "senha123" });
  await sleep(200);
  const pv = world.state.players.get(back.sessionId)!;
  assert.deepEqual([pv.x, pv.y], [SPAWN.x, SPAWN.y]);
  assert.equal(saved.world, WORLD_VERSION);
  await back.leave();
  ok("quem estava no mapa antigo entra na Vila Broto (uma vez só)");

  // sem ninguém, o tempo acaba e ele some
  await a.room.leave();
  await b.room.leave();
  await server.gracefullyShutdown(false);
  console.log(`\n${passed} verificações passaram.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFALHOU:", err);
  process.exit(1);
});
