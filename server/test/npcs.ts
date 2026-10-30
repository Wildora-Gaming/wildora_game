// Loja (venda), Mercado entre jogadores, NPCs de troca e missão, treinadores da estrada e Mercador.
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
import { MAP_OBJECTS, SPAWN, doorOf, findPath, isWalkable, objectAt } from "../../shared/map";
import { MERCHANT_SPOTS, NPCS, dayNumber, getNpc } from "../../shared/npcs";
import { SPECIES } from "../../shared/battle/data";
import { createCreature } from "../../shared/battle/engine";
import { creatureSellPrice, itemSellPrice, MERCHANT_STOCK } from "../../shared/economy";
import { getItem } from "../../shared/items";

const PORT = 2605;
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
  console.log("Loja, Mercado, NPCs e Mercador");

  // ---------- dados e posições ----------
  for (const n of NPCS) {
    const o = objectAt(n.x, n.y);
    assert.equal(o?.npcId, n.id, `${n.id} está no mapa`);
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isWalkable(n.x + dx, n.y + dy));
    assert.ok(sides.length >= 1, `${n.id} tem lado livre para conversar`);
    const [dx, dy] = sides[0];
    assert.ok(findPath(SPAWN, (x, y) => x === n.x + dx && y === n.y + dy), `${n.id} alcançável`);
    for (const sp of [n.swap?.want, n.swap?.give, ...(n.team ?? []).map(([s]) => s), ...(n.quests ?? []).map((q) => ("species" in q.task ? q.task.species : undefined))])
      if (sp) assert.ok(SPECIES[sp], `${sp} existe (${n.id})`);
    for (const q of n.quests ?? []) for (const id of Object.keys(q.reward.items ?? {})) assert.ok(getItem(id), `${id} existe`);
  }
  for (const sp of MERCHANT_SPOTS) {
    assert.ok(isWalkable(sp.x, sp.y), `mercador em ${sp.region} num lugar livre`);
    assert.ok(findPath(SPAWN, (x, y) => Math.abs(x - sp.x) + Math.abs(y - sp.y) === 1), `mercador em ${sp.region} alcançável`);
  }
  ok(`${NPCS.length} personagens e ${MERCHANT_SPOTS.length} lugares do Mercador, todos alcançáveis`);

  const store = new FileStore(joinPath(mkdtempSync(joinPath(tmpdir(), "wildora-npc-")), "save.json"), 100);
  WorldRoom.store = store;
  WorldRoom.local = store;
  const server = new Server({ transport: new WebSocketTransport() });
  server.define(ROOM_NAME, WorldRoom);
  await server.listen(PORT);

  const join = async (name: string, mode = "register") => {
    const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ROOM_NAME, { mode, name, password: "senha123", starter: "leafin" });
    const inbox: Record<string, any[]> = { profile: [], notice: [], dialog: [], market: [], shop: [], npc_swap: [], battle_start: [], battle_turn: [], chat: [] };
    for (const t of Object.keys(inbox)) room.onMessage(t, (m) => inbox[t].push(m));
    for (const t of ["npc_swap_done", "gym_offer", "tutor_open"]) room.onMessage(t, () => {});
    await waitFor(() => inbox.profile.length > 0, "perfil");
    return { room, inbox };
  };
  const a = await join("Vera");
  const b = await join("Otto");
  const world = matchMaker.getLocalRoomById(a.room.roomId) as WorldRoom;
  const sess = (c: { room: { sessionId: string } }) => (world as any).sessions.get(c.room.sessionId);
  const put = (c: { room: { sessionId: string } }, x: number, y: number, dir = "down") => {
    const p = world.state.players.get(c.room.sessionId)!;
    p.x = x;
    p.y = y;
    p.dir = dir;
  };
  const ta = sess(a).trainer;
  const tb = sess(b).trainer;

  // ---------- vender para a Loja ----------
  const shop = MAP_OBJECTS.find((o) => o.role === "shop")!;
  const sd = doorOf(shop);
  put(a, sd.x, sd.y + 1, "up");
  ta.bag.pocao = 3;
  const m0 = ta.money;
  a.room.send("sell_item", { itemId: "pocao", qty: 2 });
  await waitFor(() => ta.bag.pocao === 1, "vendeu poção");
  assert.equal(ta.money, m0 + 2 * itemSellPrice("pocao"));
  const boxed = createCreature("zebri", 20);
  ta.box.push(boxed);
  const price = creatureSellPrice(boxed);
  assert.ok(price > 0);
  a.room.send("sell_creature", { uid: boxed.uid });
  await waitFor(() => !ta.box.length, "vendeu criatura");
  assert.equal(ta.money, m0 + 2 * itemSellPrice("pocao") + price);
  const lend = createCreature("solvaris", 70);
  ta.box.push(lend);
  a.room.send("sell_creature", { uid: lend.uid });
  await waitFor(() => a.inbox.notice.some((n) => /não compra criaturas lendárias/.test(n.text)), "lendário recusado");
  ta.box.pop();
  ok("Loja compra itens pela metade e criaturas da caixa pelo nível; lendários não");

  // ---------- Mercado ----------
  const livia = getNpc("livia")!;
  put(a, livia.x - 1, livia.y, "right");
  put(b, livia.x, livia.y + 1, "up");
  a.room.send("interact");
  await waitFor(() => a.inbox.market.length > 0, "abriu o mercado");
  const forSale = createCreature("ignicub", 18);
  ta.box.push(forSale);
  a.room.send("market_list", { uid: forSale.uid, price: 1000 });
  await waitFor(() => a.inbox.market.at(-1)?.mine.length === 1, "oferta publicada");
  assert.ok(!ta.box.some((c: any) => c.uid === forSale.uid), "saiu da caixa");
  ta.bag.super_pocao = 2;
  a.room.send("market_list", { itemId: "super_pocao", qty: 2, price: 500 });
  await waitFor(() => a.inbox.market.at(-1)?.mine.length === 2, "item publicado");
  assert.equal(ta.bag.super_pocao, undefined);
  ok("anunciar criatura e item: saem do time/caixa/mochila e aparecem no Mercado");

  b.room.send("market_open");
  await waitFor(() => b.inbox.market.at(-1)?.listings.length === 2, "Otto vê as ofertas");
  const offer = b.inbox.market.at(-1).listings.find((l: any) => l.creature);
  tb.money = 5000;
  const before = ta.money;
  b.room.send("market_buy", { id: offer.id });
  await waitFor(() => tb.team.some((c: any) => c.uid === forSale.uid), "Otto recebeu a criatura");
  assert.equal(tb.money, 4000);
  await waitFor(() => ta.money === before + 950, "Vera recebeu (menos 5%)");
  assert.ok(tb.dex.caught.includes("ignicub"));
  ok("comprar: criatura vai para o comprador e o vendedor online recebe na hora (taxa de 5%)");

  // vendedor offline recebe ao entrar
  const itemOffer = b.inbox.market.at(-1).listings.find((l: any) => l.itemId);
  await a.room.leave();
  await sleep(300);
  b.room.send("market_buy", { id: itemOffer.id });
  await waitFor(() => tb.bag.super_pocao === 2, "Otto recebeu as poções");
  const vera = store.findByName("Vera")!;
  const offlineMoney = vera.money;
  const a2 = await join("Vera", "login");
  await waitFor(() => a2.inbox.notice.some((n) => /Mercado: você vendeu 2× Super Poção para Otto/.test(n.text)), "aviso da venda");
  assert.equal(sess(a2).trainer.money, offlineMoney + 475);
  ok("vendedor offline recebe as Sementes quando entra de novo");

  // retirar oferta
  put(a2, livia.x - 1, livia.y, "right");
  const t2 = sess(a2).trainer;
  t2.bag.orbi = 4;
  a2.room.send("market_list", { itemId: "orbi", qty: 3, price: 100 });
  await waitFor(() => a2.inbox.market.at(-1)?.mine.length === 1, "oferta nova");
  a2.room.send("market_cancel", { id: a2.inbox.market.at(-1).mine[0].id });
  await waitFor(() => t2.bag.orbi === 4, "voltou para a mochila");
  b.room.send("market_buy", { id: "nao-existe" });
  a2.room.send("market_list", { itemId: "orbi", qty: 50, price: 100 }); // não tem tudo isso
  await sleep(200);
  assert.equal(t2.bag.orbi, 4);
  ok("retirar devolve a oferta; pedidos inválidos são ignorados");

  // ---------- troca com NPC ----------
  const juca = getNpc("juca")!;
  put(a2, juca.x + 1, juca.y, "left");
  const pawly = createCreature("pawly", 12);
  t2.team.push(pawly);
  a2.room.send("interact");
  await waitFor(() => a2.inbox.npc_swap.length === 1, "oferta de troca");
  a2.room.send("npc_swap", { npcId: "juca", uid: pawly.uid });
  await waitFor(() => t2.team.some((c: any) => c.speciesId === "bubblit" && c.level === 12), "recebeu Bubblit");
  assert.ok(!t2.team.some((c: any) => c.uid === pawly.uid));
  const again = createCreature("pawly", 5);
  t2.team.push(again);
  a2.room.send("npc_swap", { npcId: "juca", uid: again.uid });
  await sleep(200);
  assert.ok(t2.team.some((c: any) => c.uid === again.uid), "só troca uma vez");
  ok("troca com NPC: entrega a espécie pedida e recebe outra no mesmo nível, uma vez só");

  // ---------- missão ----------
  const ana = getNpc("ana")!;
  put(a2, ana.x + 1, ana.y, "left");
  await sleep(450);
  a2.room.send("interact");
  await waitFor(() => a2.inbox.dialog.some((d) => d.title === "Profa. Ana" && /Capture 3 criaturas/.test(d.text)), "missão aceita");
  (world as any).questEvent((world as any).clientOf(a2.room.sessionId), t2, { kind: "catch", species: "pawly", zone: "Campina Norte" });
  (world as any).questEvent((world as any).clientOf(a2.room.sessionId), t2, { kind: "win", species: "pawly", zone: "Campina Norte" });
  (world as any).questEvent((world as any).clientOf(a2.room.sessionId), t2, { kind: "catch", species: "zebri", zone: "Pradaria Sul" });
  (world as any).questEvent((world as any).clientOf(a2.room.sessionId), t2, { kind: "catch", species: "rocky", zone: "Pradaria Sul" });
  await waitFor(() => a2.inbox.notice.some((n) => /Missão concluída! Volte para falar com Profa. Ana/.test(n.text)), "aviso de missão");
  const prata = t2.bag.orbi_prata ?? 0;
  await sleep(450);
  a2.room.send("interact");
  await waitFor(() => (t2.bag.orbi_prata ?? 0) === prata + 3, "recompensa");
  assert.equal(t2.progress.quests.ana.step, 1);
  assert.ok(a2.inbox.dialog.some((d) => /Próximo pedido: Vença 10/.test(d.text)));
  ok("missão: aceita conversando, conta capturas, avisa e entrega a recompensa");

  // ---------- treinador da estrada ----------
  const leo = getNpc("estrada_leste")!;
  t2.team.unshift(createCreature("leafaurus", 70));
  for (const c of t2.team) c.hp = 999 > 0 ? c.hp : c.hp;
  const near = [[0, 2], [2, 0], [0, -2], [-2, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => ({ x: leo.x + dx, y: leo.y + dy })).find((p) => isWalkable(p.x, p.y))!;
  const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: near.x + dx, y: near.y + dy, dx, dy })).find((p) => isWalkable(p.x, p.y) && Math.abs(p.x - leo.x) + Math.abs(p.y - leo.y) > 2)!;
  const dir = from.dx === 1 ? "left" : from.dx === -1 ? "right" : from.dy === 1 ? "up" : "down";
  put(a2, from.x, from.y);
  a2.room.send("move", { dir, seq: 900 });
  await waitFor(() => a2.inbox.battle_start.length === 1, "Léo desafiou");
  assert.equal(a2.inbox.battle_start[0].trainer.name, "Léo");
  world.rng = () => 0.5;
  for (let i = 0; i < 30 && !a2.inbox.battle_turn.some((t) => t.over); i++) {
    await sleep(340);
    const last = a2.inbox.battle_turn.at(-1);
    if (last?.needSwitch) a2.room.send("battle_action", { kind: "switch", index: last.team.findIndex((c: any) => c.hp > 0) });
    else {
      const me = (last ?? a2.inbox.battle_start[0]).team[(last ?? a2.inbox.battle_start[0]).active];
      const best = me.moves.reduce((bi: number, m: any, i: number, arr: any[]) => ((m.power ?? 0) > (arr[bi].power ?? 0) ? i : bi), 0);
      a2.room.send("battle_action", { kind: "move", moveIndex: best });
    }
    await sleep(60);
  }
  const end = a2.inbox.battle_turn.find((t) => t.over);
  if (!end) console.log("turnos:", a2.inbox.battle_turn.length, JSON.stringify(a2.inbox.battle_turn.at(-1)?.events), JSON.stringify(a2.inbox.battle_start[0].team.map((c: any) => [c.speciesId, c.level, c.hp])), a2.inbox.notice.slice(-3));
  assert.ok(end.events.some((e: any) => e.t === "end" && e.result === "win"));
  assert.equal(t2.progress.roadWins.estrada_leste, dayNumber(Date.now()));
  // perto de novo: não desafia (já venceu hoje)
  put(a2, from.x, from.y);
  sess(a2).roadSeen.clear();
  a2.room.send("move", { dir, seq: 901 });
  await sleep(300);
  assert.equal(a2.inbox.battle_start.length, 1);
  ok("treinador da estrada desafia quem passa perto; vencido, só volta no dia seguinte");

  // ---------- Mercador viajante ----------
  const mc = world.state.merchant;
  assert.ok(MERCHANT_SPOTS.some((s) => s.x === mc.x && s.y === mc.y), "mercador num dos lugares");
  const side = [[1, 0, "left"], [-1, 0, "right"], [0, 1, "up"], [0, -1, "down"]].find(([dx, dy]) => isWalkable(mc.x + (dx as number), mc.y + (dy as number)))!;
  put(a2, mc.x + (side[0] as number), mc.y + (side[1] as number), side[2] as string);
  await sleep(450);
  a2.room.send("interact");
  await waitFor(() => a2.inbox.shop.some((s) => s.shop === "mercador"), "barraca do mercador");
  t2.money = 10_000;
  const ouro = t2.bag.orbi_ouro ?? 0;
  a2.room.send("buy", { itemId: "orbi_ouro", qty: 1, shop: "mercador" });
  await waitFor(() => (t2.bag.orbi_ouro ?? 0) === ouro + 1, "comprou Orbi Ouro");
  assert.equal(t2.money, 10_000 - MERCHANT_STOCK.find((s) => s.itemId === "orbi_ouro")!.price);
  put(a2, SPAWN.x, SPAWN.y);
  a2.room.send("buy", { itemId: "orbi_ouro", qty: 1, shop: "mercador" });
  await sleep(200);
  assert.equal(t2.bag.orbi_ouro, ouro + 1, "longe não compra");
  const was = { x: mc.x, y: mc.y };
  world.moveMerchant();
  assert.ok(mc.x !== was.x || mc.y !== was.y, "mudou de lugar");
  await waitFor(() => b.inbox.chat.some((m) => m.system && /mercador viajante, montou a barraca/.test(m.text)), "aviso no chat");
  ok("Mercador viajante vende itens raros de perto e muda de lugar com aviso no chat");

  await a2.room.leave();
  await b.room.leave();
  await server.gracefullyShutdown(false);
  console.log(`\n${passed} verificações passaram.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFALHOU:", err);
  process.exit(1);
});
