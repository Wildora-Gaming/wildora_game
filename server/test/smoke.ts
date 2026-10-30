// Teste de ponta a ponta: sobe um servidor de verdade e joga com clientes reais.
// Cobre contas, salvamento, movimento, chat, batalha, captura, cura, loja e caixa.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { WorldRoom } from "../src/rooms/WorldRoom";
import { FileStore } from "../src/store/file-store";
import { CHAT_MAX_LENGTH, MOVE_BURST, MOVE_COOLDOWN_MS, ROOM_NAME } from "../../shared/constants";
import {
  HEAL_POINT,
  MAP_HEIGHT,
  MAP_OBJECTS,
  MAP_TILES,
  MAP_WIDTH,
  SPAWN,
  Tile,
  doorOf,
  findPath,
  isWalkable,
  tileAt,
} from "../../shared/map";
import { encodeLook, parseLook } from "../../shared/avatar/look";
import { createCreature } from "../../shared/battle/engine";

const PORT = 2599;
const URL = `ws://localhost:${PORT}`;
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

async function walk(room: Room, dir: string, steps: number) {
  for (let i = 0; i < steps; i++) {
    room.send("move", { dir });
    await sleep(STEP);
  }
}

/** Segue um caminho de tiles adjacentes, um passo por vez. */
async function walkPath(room: Room, path: { x: number; y: number }[]) {
  for (const step of path) {
    const p = me(room);
    const dir = step.x > p.x ? "right" : step.x < p.x ? "left" : step.y > p.y ? "down" : "up";
    room.send("move", { dir });
    await sleep(STEP);
  }
}

let passed = 0;
function ok(label: string) {
  passed++;
  console.log(`  ✓ ${label}`);
}

/** Cliente com caixa de mensagens recebidas, por tipo. */
async function join(options: Record<string, unknown>) {
  const inbox: Record<string, any[]> = {};
  const room = await new Client(URL).joinOrCreate(ROOM_NAME, options);
  for (const type of ["profile", "battle_start", "battle_turn", "chat", "dialog", "shop", "notice"]) {
    inbox[type] = [];
    room.onMessage(type, (m) => inbox[type].push(m));
  }
  return { room, inbox };
}

async function joinFails(options: Record<string, unknown>) {
  try {
    const r = await new Client(URL).joinOrCreate(ROOM_NAME, options);
    await r.leave();
    return "";
  } catch (err) {
    return (err as Error).message;
  }
}

async function main() {
  console.log("Servidor e clientes");
  const dir = mkdtempSync(joinPath(tmpdir(), "wildora-"));
  const dataFile = joinPath(dir, "save.json");
  const store = new FileStore(dataFile, 200);
  WorldRoom.store = store;
  WorldRoom.local = store;

  assert.equal(MAP_TILES.length, MAP_WIDTH * MAP_HEIGHT);
  assert.equal(tileAt(SPAWN.x, SPAWN.y), Tile.Path);
  assert.ok(isWalkable(HEAL_POINT.x, HEAL_POINT.y));
  ok("mapa: tamanho, spawn e Centro de Cura acessíveis");

  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define(ROOM_NAME, WorldRoom);
  await gameServer.listen(PORT);

  // ---------- Contas ----------
  const ANA = { name: "Ana", password: "senha123" };
  const { room: a, inbox: ia } = await join({ mode: "register", ...ANA, starter: "flambo", look: "3.4.4.1.2.2.5.2.3.9.2.7" });
  assert.match(await joinFails({ mode: "register", name: "ana", password: "outra123" }), /já está em uso/);
  assert.match(await joinFails({ mode: "login", name: "Ana", password: "errada" }), /incorretos/);
  assert.match(await joinFails({ mode: "register", name: "Zé", password: "12" }), /pelo menos 4/);
  ok("cadastro, nome repetido, senha errada e senha curta");

  const { room: b, inbox: ib } = await join({ mode: "register", name: "Beto<script>", password: "abcd", starter: "hacker", look: "99.x.-1" });
  assert.equal(a.roomId, b.roomId);
  await waitFor(() => a.state.players?.size === 2 && b.state.players?.size === 2, "dois jogadores");
  ok("dois clientes na mesma sala e cada um vê o outro");

  assert.equal(me(b).name, "Betoscript");
  assert.equal(b.state.players.get(a.sessionId)?.look, "3.4.4.1.2.2.5.2.3.9.2.7");
  assert.equal(me(b).look, encodeLook(parseLook("")));
  ok("nome e aparência validados e sincronizados");

  await waitFor(() => ia.profile.length > 0 && ib.profile.length > 0, "perfil inicial");
  const pa = ia.profile[0];
  assert.equal(pa.team[0].speciesId, "flambo");
  assert.equal(pa.team[0].level, 5);
  assert.equal(pa.money, 500);
  assert.deepEqual(pa.bag, { orbi: 5, pocao: 3 });
  assert.equal(ib.profile[0].team[0].speciesId, "leafin", "inicial inválido cai no padrão");
  ok("perfil inicial: criatura, 500 Sementes, 5 Orbis e 3 Poções");

  // ---------- Movimento e chat ----------
  assert.deepEqual([me(a).x, me(a).y], [SPAWN.x, SPAWN.y]);
  a.send("move", { dir: "right" });
  await waitFor(() => b.state.players.get(a.sessionId)?.x === SPAWN.x + 1, "B ver A andar");
  // Balde de passos: com ele cheio, uma rajada maior que o balde anda no máximo MOVE_BURST tiles
  await sleep(MOVE_COOLDOWN_MS * (MOVE_BURST + 1));
  const x0 = me(a).x;
  const burst = MOVE_BURST + 5;
  for (let i = 0; i < burst; i++) a.send("move", { dir: "left", seq: 100 + i });
  await waitFor(() => me(a).seq === 100 + burst - 1, "confirmação do último pedido");
  assert.equal(x0 - me(a).x, MOVE_BURST, `só ${MOVE_BURST} passos da rajada deveriam ser aceitos`);
  // volta ao spawn no ritmo normal
  await walk(a, "right", MOVE_BURST);
  assert.equal(me(a).x, SPAWN.x);
  a.send("move", { dir: "up", seq: 5 }); // número velho: não volta a confirmação
  await sleep(STEP);
  assert.equal(me(a).seq, 100 + burst - 1);
  a.send("move", { dir: "teleport" });
  a.send("hack", { x: 1 });
  ok("movimento sincronizado, limite de velocidade com rajada, confirmação por número e mensagens inválidas");

  await walk(a, "up", 8);
  assert.ok(!isWalkable(me(a).x, me(a).y - 1));
  ok(`colisão com objetos (parou em ${me(a).x},${me(a).y})`);

  a.send("chat", { text: "  oi   pessoal  " });
  await waitFor(() => ib.chat.some((m) => m.from === "Ana" && m.text === "oi pessoal"), "chat");
  await sleep(800);
  a.send("chat", { text: "x".repeat(500) });
  await waitFor(() => ib.chat.some((m) => m.from === "Ana" && m.text.length === CHAT_MAX_LENGTH), "chat longo");
  ok("chat normalizado e limitado");

  // ---------- Placa ----------
  const sign = MAP_OBJECTS.find((o) => o.kind === "sign" && o.text?.startsWith("Vila Broto"))!;
  await walkPath(a, findPath(me(a), (x, y) => x === sign.x && y === sign.y + 1)!);
  a.send("move", { dir: "up" }); // vira para a placa
  await sleep(STEP);
  a.send("interact");
  await waitFor(() => ia.dialog.length > 0, "placa");
  assert.match(ia.dialog[0].text, /Vila Broto/);
  ok("ler placa com interação");

  // ---------- Batalha ----------
  const room = matchMaker.getLocalRoomById(a.roomId) as WorldRoom;
  const route = findPath(me(a), (x, y) => tileAt(x, y) === Tile.TallGrass)!;
  room.rng = () => 0.99;
  await walkPath(a, route.slice(0, -1));
  room.rng = () => 0;
  await walkPath(a, route.slice(-1));
  await waitFor(() => ia.battle_start.length === 1, "batalha começar");
  room.rng = seeded(42);
  const start = ia.battle_start[0];
  assert.equal(start.team[start.active].speciesId, "flambo");
  assert.equal(start.foe.moves.length, 0, "golpes do selvagem ficam ocultos");
  await waitFor(() => b.state.players.get(a.sessionId)?.inBattle === true, "B ver A em batalha");
  ok(`encontro na ${start.zone}: ${start.foe.name} nv. ${start.foe.level}`);

  const pos = [me(a).x, me(a).y];
  await walk(a, "up", 2);
  assert.deepEqual([me(a).x, me(a).y], pos);
  a.send("battle_action", { kind: "move", moveIndex: 9 });
  a.send("battle_action", { kind: "item", itemId: "orbi_ouro" }); // não tem na mochila
  await sleep(400);
  assert.equal(ia.battle_turn.length, 0);
  ok("não anda em batalha; ações inválidas e itens que não tem são ignorados");

  // Captura garantida: RNG 0 acerta qualquer chance > 0
  room.rng = () => 0;
  a.send("battle_action", { kind: "item", itemId: "orbi" });
  await waitFor(() => ia.battle_turn.length === 1, "turno da captura");
  const capture = ia.battle_turn[0];
  const kinds = capture.events.map((e: any) => e.t);
  assert.ok(kinds.includes("caught") && kinds.includes("sent") && kinds.includes("money"), kinds.join(","));
  assert.equal(capture.over, true);
  assert.equal(capture.bag.orbi, 4);
  await waitFor(() => ia.profile.length >= 2 && ia.profile.at(-1).team.length === 2, "time com 2");
  assert.ok(ia.profile.at(-1).money > 500);
  ok(`captura com Orbi: ${start.foe.name} entrou no time e rendeu Sementes`);

  // Segunda batalha até o fim
  const grass = { x: me(a).x, y: me(a).y };
  const back = route.at(-2) ?? SPAWN;
  room.rng = () => 0.99;
  await sleep(STEP);
  await walkPath(a, [back]);
  room.rng = () => 0;
  await walkPath(a, [grass]);
  await waitFor(() => ia.battle_start.length === 2, "segunda batalha");
  room.rng = seeded(7);
  const firstTurn = ia.battle_turn.length;
  const lastOfThis = () => (ia.battle_turn.length > firstTurn ? ia.battle_turn.at(-1) : undefined);
  for (let i = 0; i < 60 && !lastOfThis()?.over; i++) {
    const before = ia.battle_turn.length;
    const last = lastOfThis();
    if (last?.needSwitch) {
      const idx = last.team.findIndex((c: any) => c.hp > 0);
      a.send("battle_action", { kind: "switch", index: idx });
    } else {
      a.send("battle_action", { kind: "move", moveIndex: 0 });
    }
    await waitFor(() => ia.battle_turn.length > before, "turno");
    await sleep(320);
  }
  const end = ia.battle_turn.at(-1).events.at(-1);
  assert.equal(end.t, "end");
  await waitFor(() => b.state.players.get(a.sessionId)?.inBattle === false, "fim visível");
  ok(`batalha jogada até o fim: ${end.result}`);

  // Fuga
  room.rng = () => 0.99;
  await sleep(STEP);
  await walkPath(a, findPath(me(a), (x, y) => tileAt(x, y) !== Tile.TallGrass)!);
  const nb = ia.battle_start.length;
  room.rng = () => 0;
  await walkPath(a, findPath(me(a), (x, y) => tileAt(x, y) === Tile.TallGrass)!);
  await waitFor(() => ia.battle_start.length > nb, "terceiro encontro");
  const nt = ia.battle_turn.length;
  a.send("battle_action", { kind: "run" });
  await waitFor(() => ia.battle_turn.length > nt, "fuga");
  assert.deepEqual(ia.battle_turn.at(-1).events, [{ t: "run", ok: true }, { t: "end", result: "ran" }]);
  ok("fuga de criatura selvagem");

  // ---------- Centro de Cura, Loja, caixa ----------
  room.rng = () => 0.99; // sem encontros no caminho
  const heal = MAP_OBJECTS.find((o) => o.role === "heal")!;
  const healDoor = doorOf(heal);
  await sleep(STEP);
  await walkPath(a, findPath(me(a), (x, y) => x === healDoor.x && y === healDoor.y + 1)!);
  a.send("move", { dir: "up" });
  await sleep(STEP);
  const nd = ia.dialog.length;
  a.send("interact");
  await waitFor(() => ia.dialog.length > nd, "cura");
  assert.match(ia.dialog.at(-1).title, /Centro de Cura/);
  await waitFor(() => ia.profile.at(-1).team.every((c: any) => c.hp === c.maxHp), "time curado");
  ok("Centro de Cura recupera o time");

  const shop = MAP_OBJECTS.find((o) => o.role === "shop")!;
  const shopDoor = doorOf(shop);
  await sleep(STEP);
  await walkPath(a, findPath(me(a), (x, y) => x === shopDoor.x && y === shopDoor.y + 1)!);
  a.send("move", { dir: "up" });
  await sleep(STEP);
  a.send("interact");
  await waitFor(() => ia.shop.length > 0, "loja");
  const money = ia.profile.at(-1).money;
  const orbis = ia.profile.at(-1).bag.orbi ?? 0;
  a.send("buy", { itemId: "orbi", qty: 2 });
  await waitFor(() => (ia.profile.at(-1).bag.orbi ?? 0) === orbis + 2, "compra");
  assert.equal(ia.profile.at(-1).money, money - 400);
  a.send("buy", { itemId: "orbi_ouro", qty: 1 }); // não está à venda
  a.send("buy", { itemId: "orbi", qty: 9999 });
  await sleep(300);
  assert.equal(ia.profile.at(-1).bag.orbi, orbis + 2);
  ok("Loja vende Orbis e recusa compras inválidas");

  const teamBefore = ia.profile.at(-1).team.length;
  const np = ia.profile.length;
  a.send("box_deposit", { index: teamBefore - 1 });
  await waitFor(() => ia.profile.length > np, "caixa");
  assert.equal(ia.profile.at(-1).team.length, teamBefore - 1);
  assert.equal(ia.profile.at(-1).box.length, 1);
  a.send("box_withdraw", { index: 0 });
  await waitFor(() => ia.profile.at(-1).team.length === teamBefore, "tirar da caixa");
  a.send("team_order", { from: 1, to: 0 });
  await waitFor(() => ia.profile.at(-1).team[0].speciesId !== "flambo", "nova líder");
  ok("caixa e ordem do time");

  // ---------- Ginásio ----------
  {
    // time forte para atravessar o ginásio rápido (acesso direto à sessão do servidor)
    const session = (room as any).sessions.get(a.sessionId);
    session.trainer.team.unshift(createCreature("flamberus", 60));
    const gymObj = MAP_OBJECTS.find((o) => o.kind === "gym" && o.gymId === "fera")!;
    const door = doorOf(gymObj);
    room.rng = () => 0.99;
    await walkPath(a, findPath(me(a), (x, y) => x === door.x && y === door.y + 1)!);
    const offers: any[] = [];
    a.onMessage("gym_offer", (m) => offers.push(m));
    a.send("move", { dir: "up" }); // anda contra a porta
    await waitFor(() => offers.length > 0, "oferta do ginásio");
    assert.equal(offers[0].gymId, "fera");
    assert.equal(offers[0].hasBadge, false);
    const starts0 = ia.battle_start.length;
    const turns0 = ia.battle_turn.length;
    room.rng = seeded(3);
    a.send("gym_challenge", { gymId: "fera" });
    for (let i = 0; i < 80; i++) {
      const started = ia.battle_start.length - starts0;
      const finished = ia.battle_turn.slice(turns0).filter((t: any) => t.over).length;
      if (started === 3 && finished === 3) break;
      if (finished >= started) {
        await sleep(100); // esperando o próximo treinador
        continue;
      }
      const last = ia.battle_turn.at(-1);
      const before = ia.battle_turn.length;
      if (last?.needSwitch && !last.over) a.send("battle_action", { kind: "switch", index: last.team.findIndex((c: any) => c.hp > 0) });
      else a.send("battle_action", { kind: "move", moveIndex: 0 });
      await waitFor(() => ia.battle_turn.length > before, "turno do ginásio", 4000);
      await sleep(330);
    }
    const starts = ia.battle_start.slice(starts0);
    assert.deepEqual(starts.map((m: any) => m.trainer?.name), ["Bia", "Caio", "Duda"]);
    assert.equal(starts[2].foeCount, 3);
    const gymTurns = ia.battle_turn.slice(turns0).flatMap((t: any) => t.events.map((e: any) => e.t));
    assert.ok(gymTurns.includes("foe_switch"), "treinador troca de criatura");
    await waitFor(() => ia.dialog.some((d) => d.title === "Insígnia Garra"), "insígnia");
    await waitFor(() => ia.profile.at(-1).badges.includes("fera"), "insígnia no perfil");
    assert.ok((ia.profile.at(-1).bag.orbi_prata ?? 0) >= 2, "prêmio do líder");
    room.rng = Math.random;
    ok("ginásio: 2 treinadores e o líder em sequência, troca do inimigo, insígnia e prêmio");
  }

  // ---------- Salvamento ----------
  const saved = { x: me(a).x, y: me(a).y, team: ia.profile.at(-1).team.length };
  await b.leave();
  await waitFor(() => a.state.players.size === 1, "B sair");
  await a.leave();
  await sleep(300);
  await store.flush();
  const file = JSON.parse(readFileSync(dataFile, "utf8"));
  assert.equal(file.trainers.length, 2);
  assert.ok(!JSON.stringify(file).includes("senha123"), "senha não pode ser gravada em texto");
  const again = await join({ mode: "login", ...ANA });
  await waitFor(() => again.inbox.profile.length > 0, "perfil após login");
  assert.equal(again.inbox.profile[0].team.length, saved.team);
  assert.deepEqual([me(again.room).x, me(again.room).y], [saved.x, saved.y]);
  ok("progresso salvo: login devolve posição e time; senha guardada com hash");

  // Nova instância do Store lendo o mesmo arquivo (simula reiniciar o servidor)
  await again.room.leave();
  await sleep(300);
  await store.flush();
  const reloaded = new FileStore(dataFile);
  assert.equal(reloaded.findByName("ANA")?.team.length, saved.team);
  assert.ok(reloaded.checkPassword(reloaded.findByName("ana")!.id, "senha123"), "senha confere depois de recarregar");
  ok("arquivo de save sobrevive a reiniciar o servidor");

  await gameServer.gracefullyShutdown(false);
  rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passed} verificações passaram.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFALHOU:", err);
  process.exit(1);
});
