// Doce Estelar (sobe 1 nível, com evolução) e Casa do Treinador (troca de golpes).
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
import { MAP_OBJECTS, doorOf } from "../../shared/map";
import { isValidAction, startBattle, createCreature, xpForLevel } from "../../shared/battle/engine";
import { candyChance } from "../../shared/items";
import { GYMS, gymLevelCap } from "../../shared/gyms";

const PORT = 2603;
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
  console.log("Doce Estelar e Casa do Treinador");
  const store = new FileStore(joinPath(mkdtempSync(joinPath(tmpdir(), "wildora-tutor-")), "save.json"), 100);
  WorldRoom.store = store;
  WorldRoom.local = store;
  const server = new Server({ transport: new WebSocketTransport() });
  server.define(ROOM_NAME, WorldRoom);
  await server.listen(PORT);

  const inbox: Record<string, any[]> = { profile: [], dialog: [], notice: [] };
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, { mode: "register", name: "Tina", password: "senha123", starter: "flambo" });
  for (const t of Object.keys(inbox)) room.onMessage(t, (m) => inbox[t].push(m));
  for (const t of ["battle_start", "chat", "shop", "tutor_open", "gym_offer"]) room.onMessage(t, () => {});
  await waitFor(() => inbox.profile.length > 0, "perfil");
  const world = matchMaker.getLocalRoomById(room.roomId) as WorldRoom;
  const session = (world as any).sessions.get(room.sessionId);
  const t = session.trainer;

  // ---------- Doce Estelar ----------
  const flambo = t.team[0];
  flambo.level = 15;
  flambo.xp = xpForLevel(15);
  t.bag.doce_estelar = 2;
  room.send("use_item", { itemId: "doce_estelar", target: 0 });
  await waitFor(() => inbox.dialog.length === 1, "aviso do doce");
  assert.equal(inbox.dialog[0].title, "Evolução!");
  assert.match(inbox.dialog[0].text, /nível 16.*evoluiu para Flamber/);
  assert.equal(flambo.speciesId, "flamber");
  assert.equal(flambo.level, 16);
  assert.equal(t.bag.doce_estelar, 1);
  assert.ok(t.dex.caught.includes("flamber"));
  ok("Doce Estelar sobe 1 nível, evolui no nível certo e registra na Criaturopédia");

  room.send("use_item", { itemId: "doce_estelar", target: 0 });
  await waitFor(() => inbox.dialog.length === 2, "segundo doce");
  assert.equal(inbox.dialog[1].title, "Doce Estelar");
  assert.equal(flambo.level, 17);
  assert.equal(t.bag.doce_estelar, undefined, "acabou o doce");
  room.send("use_item", { itemId: "doce_estelar", target: 0 });
  await sleep(200);
  assert.equal(flambo.level, 17, "sem doce não sobe");

  const battle = startBattle([createCreature("leafin", 5)], createCreature("pawly", 3));
  assert.equal(isValidAction(battle, { kind: "item", itemId: "doce_estelar" }), false);
  ok("doce só fora de batalha e só se tiver na mochila");

  // vencer criatura selvagem de nível 10+ deixa um Doce Estelar
  inbox.battle_turn = [];
  room.onMessage("battle_turn", (m) => inbox.battle_turn.push(m));
  const wild = createCreature("pawly", 12);
  wild.hp = 1;
  world.rng = () => 0; // 5% de chance de doce: com rng 0 sempre sai
  session.battle = startBattle(t.team, wild, true);
  session.battleZone = "Teste";
  await sleep(350);
  room.send("battle_action", { kind: "move", moveIndex: 1 });
  await waitFor(() => inbox.battle_turn.length > 0, "turno");
  const turn = inbox.battle_turn[0];
  assert.ok(turn.events.some((e: any) => e.t === "found" && e.itemId === "doce_estelar"), "achou o doce");
  assert.equal(t.bag.doce_estelar, 1);
  t.bag.doce_estelar = 0;
  delete t.bag.doce_estelar;
  world.rng = Math.random;
  assert.equal(candyChance(12), 0.05);
  assert.equal(candyChance(20), 0.1);
  ok("vencer criatura selvagem pode dar um Doce Estelar (5%, ou 10% a partir do nível 20)");

  // ginásio com limite de nível: criaturas acima ficam de fora
  const gym = GYMS[0];
  const gymObj = MAP_OBJECTS.find((o) => o.kind === "gym" && o.gymId === gym.id)!;
  const gp = world.state.players.get(room.sessionId)!;
  gp.x = doorOf(gymObj).x;
  gp.y = doorOf(gymObj).y + 1;
  room.send("gym_challenge", { gymId: gym.id });
  await waitFor(() => inbox.notice.some((n) => new RegExp(`só entram criaturas até o nível ${gymLevelCap(gym)}. Guarde na caixa: Flamber \\(Nv. 17\\)`).test(n.text)), "limite do ginásio");
  assert.equal(session.battle, null);
  ok("ginásio recusa criaturas acima do limite de nível e diz quais guardar");

  // ---------- Casa do Treinador ----------
  const tutor = MAP_OBJECTS.find((o) => o.role === "tutor")!;
  assert.ok(tutor, "casa existe no mapa");
  const door = doorOf(tutor);
  assert.deepEqual(flambo.moves, ["arranhao", "fagulha"]);

  // longe da casa não ensina
  room.send("tutor_teach", { index: 0, moveId: "mordida_firme", replace: -1 });
  await sleep(200);
  assert.equal(flambo.moves.length, 2);

  const player = world.state.players.get(room.sessionId)!;
  player.x = door.x;
  player.y = door.y + 1;
  room.send("tutor_teach", { index: 0, moveId: "mordida_firme", replace: -1 });
  await waitFor(() => flambo.moves.length === 3, "aprendeu numa vaga livre");
  assert.deepEqual(flambo.moves, ["arranhao", "fagulha", "mordida_firme"]);

  room.send("tutor_teach", { index: 0, moveId: "labareda", replace: 0 }); // nível 18: ainda não
  room.send("tutor_teach", { index: 0, moveId: "onda", replace: 0 }); // não é do Flamber
  room.send("tutor_teach", { index: 0, moveId: "fagulha", replace: 0 }); // já sabe
  await sleep(250);
  assert.deepEqual(flambo.moves, ["arranhao", "fagulha", "mordida_firme"]);
  ok("Casa do Treinador ensina só de perto, só golpes do nível e que ainda não sabe");

  flambo.level = 18;
  room.send("tutor_teach", { index: 0, moveId: "labareda", replace: 0 });
  await waitFor(() => flambo.moves[0] === "labareda", "trocou Arranhão por Labareda");
  await waitFor(() => inbox.notice.some((n) => /esqueceu Arranhão e aprendeu Labareda/.test(n.text)), "aviso");
  room.send("tutor_teach", { index: 0, moveId: "arranhao", replace: 2 });
  await waitFor(() => flambo.moves[2] === "arranhao", "reaprendeu Arranhão");
  ok("troca um golpe por outro e dá para reaprender golpes esquecidos");

  // golpes do tipo: nível mínimo e preço em Sementes
  const before = flambo.moves.slice();
  room.send("tutor_teach", { index: 0, moveId: "chama_ardente", replace: 1 });
  await waitFor(() => inbox.notice.some((n) => /precisa estar no nível 28 para aprender Chama Ardente/.test(n.text)), "nível mínimo");
  flambo.level = 32;
  t.money = 400;
  room.send("tutor_teach", { index: 0, moveId: "chama_ardente", replace: 1 });
  await waitFor(() => inbox.notice.some((n) => /Chama Ardente custa 1000 Sementes. Você tem 400/.test(n.text)), "sem Sementes");
  assert.deepEqual(flambo.moves, before);
  t.money = 1500;
  room.send("tutor_teach", { index: 0, moveId: "chama_ardente", replace: 1 });
  await waitFor(() => flambo.moves[1] === "chama_ardente", "aprendeu golpe do tipo");
  assert.equal(t.money, 500);
  room.send("tutor_teach", { index: 0, moveId: "jato_dagua", replace: 0 }); // não é do tipo Brasa
  room.send("tutor_teach", { index: 0, moveId: "patinha_quente", replace: 0 }); // básico de outra espécie
  await sleep(250);
  assert.equal(flambo.moves[0], "labareda");
  player.x = 5;
  player.y = 36;
  room.send("tutor_teach", { index: 0, moveId: "fagulha", replace: 0 });
  await waitFor(() => inbox.notice.some((n) => /Fique na porta da Casa do Treinador/.test(n.text)), "aviso de distância");
  ok("golpes do tipo: pedem nível mínimo e Sementes, e explicam quando não dá");

  await room.leave();
  await server.gracefullyShutdown(false);
  console.log(`\n${passed} verificações passaram.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFALHOU:", err);
  process.exit(1);
});
