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
import { ROOM_NAME } from "../../shared/constants";
import { EAST_X, LEGEND_SPOTS, MAP_HEIGHT, MAP_WIDTH, SPAWN, isWalkable, isWildTile, tileAt, findPath } from "../../shared/map";
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
  console.log("Expansão do leste e lendários");

  // ---------- Mapa ----------
  for (const [id, spot] of Object.entries(LEGEND_SPOTS)) {
    assert.ok(SPECIES[id], `${id} existe`);
    assert.ok(isWalkable(spot.x, spot.y), `clareira de ${id} livre`);
    assert.ok(!isWildTile(tileAt(spot.x, spot.y)), `clareira de ${id} sem grama alta`);
    assert.ok(findPath(SPAWN, (x, y) => x === spot.x && y === spot.y), `dá para chegar em ${id}`);
    assert.equal(zoneAt(spot.x, spot.y).name, spot.region);
  }
  const counts: Record<string, number> = {};
  for (let y = 0; y < MAP_HEIGHT; y++)
    for (let x = EAST_X; x < MAP_WIDTH; x++)
      if (isWildTile(tileAt(x, y)) && isWalkable(x, y)) counts[zoneAt(x, y).id] = (counts[zoneAt(x, y).id] ?? 0) + 1;
  for (const z of ["gelada", "encantado", "vulcao", "recife"]) {
    assert.ok((counts[z] ?? 0) > 60, `${z} tem grama alta (${counts[z]})`);
    for (const e of ZONES[z].table) assert.ok(SPECIES[e.speciesId], `${e.speciesId} existe`);
  }
  assert.equal(areaName(47, 37), "Vila Broto");
  assert.equal(areaName(110, 20), "Planície Gelada");
  ok("quatro biomas novos com grama alta, alcançáveis a partir da vila, e clareiras dos lendários livres");

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
