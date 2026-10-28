// Teste de fumaça: sobe um servidor de verdade, conecta dois clientes e
// verifica movimento autoritativo, colisão, limite de velocidade, chat,
// encontros na grama alta e saída de jogadores.
import assert from "node:assert/strict";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { WorldRoom } from "../src/rooms/WorldRoom";
import { CHAT_MAX_LENGTH, MOVE_COOLDOWN_MS, ROOM_NAME } from "../../shared/constants";
import { MAP_HEIGHT, MAP_TILES, MAP_WIDTH, SPAWN, Tile, findPath, isWalkable, tileAt } from "../../shared/map";
import { encodeLook, parseLook } from "../../shared/avatar/look";

const PORT = 2599;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STEP = MOVE_COOLDOWN_MS + 40;

async function waitFor(cond: () => boolean, label: string, timeout = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout esperando: ${label}`);
    await sleep(20);
  }
}

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const me = (room: Room) => room.state.players.get(room.sessionId);

/** Segue um caminho de tiles adjacentes, um passo por vez. */
async function walkPath(room: Room, path: { x: number; y: number }[]) {
  for (const step of path) {
    const p = me(room);
    const dir = step.x > p.x ? "right" : step.x < p.x ? "left" : step.y > p.y ? "down" : "up";
    room.send("move", { dir });
    await sleep(STEP);
  }
}

async function walk(room: Room, dir: string, steps: number) {
  for (let i = 0; i < steps; i++) {
    room.send("move", { dir });
    await sleep(STEP);
  }
}

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`  ✓ ${label}`);
}

async function main() {
  // Mapa
  assert.equal(MAP_TILES.length, MAP_WIDTH * MAP_HEIGHT);
  assert.equal(tileAt(SPAWN.x, SPAWN.y), Tile.Path);
  ok("mapa tem o tamanho certo e spawn é caminhável");

  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define(ROOM_NAME, WorldRoom);
  await gameServer.listen(PORT);

  const url = `ws://localhost:${PORT}`;
  const a = await new Client(url).joinOrCreate(ROOM_NAME, { name: "Ana", starter: "flambo", look: "3.4.4.1.2.2.5.2.3.9.2.7" });
  const chatB: any[] = [];
  const battleStarts: any[] = [];
  const turns: any[] = [];
  const teamA: any[] = [];
  const teamB: any[] = [];
  a.onMessage("battle_start", (m) => battleStarts.push(m));
  a.onMessage("battle_turn", (m) => turns.push(m));
  a.onMessage("team", (m) => teamA.push(m));
  a.onMessage("chat", () => {});

  const b = await new Client(url).joinOrCreate(ROOM_NAME, { name: "Beto<script>", starter: "hacker", look: "99.x.-1" });
  b.onMessage("chat", (m) => chatB.push(m));
  b.onMessage("team", (m) => teamB.push(m));
  b.onMessage("battle_start", () => {});
  b.onMessage("battle_turn", () => {});

  assert.equal(a.roomId, b.roomId);
  await waitFor(() => a.state.players?.size === 2 && b.state.players?.size === 2, "dois jogadores");
  ok("dois clientes na mesma sala e cada um vê o outro");

  assert.equal(me(b).name, "Betoscript");
  ok("nome sanitizado no servidor");

  assert.equal(b.state.players.get(a.sessionId)?.look, "3.4.4.1.2.2.5.2.3.9.2.7");
  assert.equal(me(b).look, encodeLook(parseLook("")), "aparência inválida vira o padrão");
  ok("aparência do personagem sincronizada e validada");

  assert.deepEqual([me(a).x, me(a).y], [SPAWN.x, SPAWN.y]);
  a.send("move", { dir: "right" });
  await waitFor(() => b.state.players.get(a.sessionId)?.x === SPAWN.x + 1, "B ver A andar");
  ok("movimento de A chega para B");

  await sleep(STEP);
  for (let i = 0; i < 6; i++) a.send("move", { dir: "left" });
  await sleep(STEP);
  assert.equal(me(a).x, SPAWN.x, "só um passo deveria ter sido aceito");
  ok("rajada de comandos limitada pelo cooldown do servidor");

  a.send("move", { dir: "teleport" });
  a.send("move", null);
  a.send("hack", { x: 1, y: 1 });
  await sleep(STEP);
  assert.deepEqual([me(a).x, me(a).y], [SPAWN.x, SPAWN.y]);
  ok("mensagens inválidas ignoradas sem derrubar a sala");

  // Anda para o norte pela estrada até bater no poço da praça e tenta atravessar
  await walk(a, "up", 8);
  assert.ok(!isWalkable(me(a).x, me(a).y - 1), `deveria ter parado antes de um obstáculo (${me(a).x},${me(a).y})`);
  assert.ok(isWalkable(me(a).x, me(a).y));
  assert.equal(me(a).dir, "up");
  ok(`colisão com objetos do mapa (parou em ${me(a).x},${me(a).y})`);

  // Volta ao spawn
  await walkPath(a, findPath(me(a), (x, y) => x === SPAWN.x && y === SPAWN.y)!);
  assert.deepEqual([me(a).x, me(a).y], [SPAWN.x, SPAWN.y]);

  // Chat
  a.send("chat", { text: "  oi   pessoal  " });
  await waitFor(() => chatB.some((m) => m.from === "Ana" && m.text === "oi pessoal"), "chat chegar");
  ok("chat normalizado e entregue");

  await sleep(800);
  a.send("chat", { text: "x".repeat(500) });
  await waitFor(() => chatB.some((m) => m.from === "Ana" && m.text.length === CHAT_MAX_LENGTH), "chat longo");
  ok(`chat cortado em ${CHAT_MAX_LENGTH} caracteres`);

  // Time inicial
  await waitFor(() => teamA.length > 0 && teamB.length > 0, "time inicial");
  assert.equal(teamA[0].team[0].speciesId, "flambo");
  assert.equal(teamA[0].team[0].level, 5);
  assert.equal(teamB[0].team[0].speciesId, "leafin", "inicial inválido cai no padrão");
  ok("inicial escolhido no login (e validado no servidor)");

  // Encontro forçado: RNG = 0 sempre dispara
  const room = matchMaker.getLocalRoomById(a.roomId) as WorldRoom;
  room.rng = () => 0;
  const route = findPath(me(a), (x, y) => tileAt(x, y) === Tile.TallGrass)!;
  assert.ok(route, "precisa existir caminho até a grama alta");
  room.rng = () => 0.99; // sem encontro no caminho
  await walkPath(a, route.slice(0, -1));
  room.rng = () => 0; // encontro garantido no último passo
  await walkPath(a, route.slice(-1));
  assert.equal(tileAt(me(a).x, me(a).y), Tile.TallGrass);
  await waitFor(() => battleStarts.length === 1, "batalha começar");
  room.rng = seeded(42);
  const start = battleStarts[0];
  assert.equal(start.foe.speciesId, "pawly");
  assert.equal(start.player.speciesId, "flambo");
  assert.equal(start.foe.moves.length, 0, "golpes do selvagem ficam ocultos");
  await waitFor(() => b.state.players.get(a.sessionId)?.inBattle === true, "B ver A em batalha");
  ok(`encontro abre batalha: ${start.foe.name} nv. ${start.foe.level}, visível para os outros`);

  const pos = [me(a).x, me(a).y];
  await walk(a, "up", 2);
  assert.deepEqual([me(a).x, me(a).y], pos);
  ok("não anda durante a batalha");

  a.send("battle_action", { kind: "move", moveIndex: 9 });
  a.send("battle_action", { kind: "item" });
  await sleep(400);
  assert.equal(turns.length, 0);
  ok("ações de batalha inválidas ignoradas");

  for (let i = 0; i < 40 && !turns.at(-1)?.over; i++) {
    const before = turns.length;
    a.send("battle_action", { kind: "move", moveIndex: i % start.player.moves.length });
    await waitFor(() => turns.length > before, "turno");
    await sleep(320);
  }
  const last = turns.at(-1);
  assert.ok(last.over, "batalha deveria terminar");
  const end = last.events.at(-1);
  assert.equal(end.t, "end");
  const all = turns.flatMap((t: any) => t.events);
  if (end.result === "win") assert.ok(all.some((e: any) => e.t === "xp"), "vitória dá XP");
  await waitFor(() => b.state.players.get(a.sessionId)?.inBattle === false, "fim visível");
  await waitFor(() => teamA.length >= 2, "time atualizado");
  ok(`batalha jogada até o fim em ${turns.length} turnos: ${end.result}`);

  // Fuga
  room.rng = () => 0;
  const nBattles = battleStarts.length;
  const back = route.at(-2) ?? SPAWN;
  const grassTile = { x: me(a).x, y: me(a).y };
  room.rng = () => 0.99;
  await walkPath(a, [back]);
  room.rng = () => 0;
  await walkPath(a, [grassTile]);
  await waitFor(() => battleStarts.length > nBattles, "segundo encontro");
  const nTurns = turns.length;
  a.send("battle_action", { kind: "run" });
  await waitFor(() => turns.length > nTurns, "fuga");
  assert.deepEqual(turns.at(-1).events, [{ t: "run", ok: true }, { t: "end", result: "ran" }]);
  room.rng = Math.random;
  ok("fuga de criatura selvagem");

  // Saída
  await b.leave();
  await waitFor(() => a.state.players.size === 1, "B sair");
  ok("saída de jogador propagada");

  await a.leave();
  await gameServer.gracefullyShutdown(false);
  console.log(`\n${passed} verificações passaram.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFALHOU:", err);
  process.exit(1);
});
