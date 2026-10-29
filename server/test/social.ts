// Batalha amistosa e troca entre dois jogadores, com clientes reais.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client, type Room } from "colyseus.js";
import { WorldRoom } from "../src/rooms/WorldRoom";
import { FileStore } from "../src/store/file-store";
import { ROOM_NAME } from "../../shared/constants";
import { createCreature } from "../../shared/battle/engine";
import { forSlot, resolvePvpTurn, startPvp } from "../../shared/battle/pvp";

const PORT = 2601;
const URL = `ws://localhost:${PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const ok = (label: string) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

async function waitFor(cond: () => boolean, label: string, timeout = 4000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout esperando: ${label}`);
    await sleep(20);
  }
}

const TYPES = ["profile", "battle_start", "battle_turn", "chat", "dialog", "notice", "social_request", "trade_state", "trade_end"];

async function join(name: string, starter: string) {
  const inbox: Record<string, any[]> = {};
  const room = await new Client(URL).joinOrCreate(ROOM_NAME, { mode: "register", name, password: "senha123", starter });
  for (const t of TYPES) {
    inbox[t] = [];
    room.onMessage(t, (m) => inbox[t].push(m));
  }
  return { room, inbox };
}

const last = (box: any[]) => box[box.length - 1];

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  console.log("Entre jogadores: batalha amistosa e troca");

  // ---------- Motor da batalha entre jogadores ----------
  {
    const rng = seeded(7);
    const a = [createCreature("flambo", 12), createCreature("leafin", 10)];
    const b = [createCreature("aquari", 12)];
    a[0].hp = 3; // dano de verdade não entra: a batalha amistosa começa com Vida cheia
    const st = startPvp(a, b);
    assert.equal(st.sides[0].team[0].hp > 3, true);
    assert.equal(a[0].hp, 3);
    let turns = 0;
    while (!st.result && turns < 200) {
      const acts: any = {};
      for (const s of [0, 1] as const) {
        const side = st.sides[s];
        if (st.sides[0].needSwitch || st.sides[1].needSwitch) {
          if (side.needSwitch) acts[s] = { kind: "switch", index: side.team.findIndex((c) => c.hp > 0) };
        } else acts[s] = { kind: "move", moveIndex: 0 };
      }
      const ev = resolvePvpTurn(st, acts, rng);
      // os dois pontos de vista são espelhados
      const v0 = forSlot(ev, 0);
      const v1 = forSlot(ev, 1);
      v0.forEach((e, i) => {
        if ("side" in e) assert.notEqual(e.side, (v1[i] as any).side);
      });
      turns++;
    }
    assert.ok(st.result, "batalha termina");
    assert.equal(a.length, 2);
    ok(`motor: times copiados com Vida cheia, visões espelhadas, termina em ${turns} turnos`);
  }

  const dir = mkdtempSync(joinPath(tmpdir(), "wildora-social-"));
  const dataFile = joinPath(dir, "save.json");
  const store = new FileStore(dataFile, 100);
  WorldRoom.store = store;
  WorldRoom.local = store;
  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define(ROOM_NAME, WorldRoom);
  await gameServer.listen(PORT);

  const A = await join("Ana", "flambo");
  const B = await join("Beto", "aquari");
  await waitFor(() => A.room.state.players?.size === 2 && B.room.state.players?.size === 2, "dois jogadores");
  const room = matchMaker.getLocalRoomById(A.room.roomId) as WorldRoom;
  room.rng = seeded(42);
  const sessions = (room as any).sessions as Map<string, any>;
  const trainerOf = (r: Room) => sessions.get(r.sessionId).trainer;

  // dá uma criatura extra para a Ana (para a troca e para ter troca de criatura na batalha)
  const extra = createCreature("chirpy", 8);
  extra.caughtBy = trainerOf(A.room).id;
  extra.caughtZone = "Campina Norte";
  trainerOf(A.room).team.push(extra);
  const hpBefore = trainerOf(A.room).team.map((c: any) => c.hp);

  // ---------- Pedido e recusa ----------
  A.room.send("social_request", { target: B.room.sessionId, kind: "battle" });
  await waitFor(() => B.inbox.social_request.length === 1, "pedido chega");
  assert.deepEqual(last(B.inbox.social_request), { from: A.room.sessionId, name: "Ana", kind: "battle" });
  B.room.send("social_answer", { from: A.room.sessionId, accept: false });
  await waitFor(() => A.inbox.notice.some((n) => /recusou/.test(n.text)), "recusa avisada");
  ok("desafio chega ao outro jogador e a recusa é avisada");

  // resposta a pedido inexistente não faz nada
  A.room.send("social_answer", { from: B.room.sessionId, accept: true });
  await sleep(200);
  assert.equal(A.inbox.battle_start.length, 0);

  // ---------- Batalha amistosa ----------
  await sleep(1600); // intervalo entre pedidos
  A.room.send("social_request", { target: B.room.sessionId, kind: "battle" });
  await waitFor(() => B.inbox.social_request.length === 2, "segundo pedido");
  B.room.send("social_answer", { from: A.room.sessionId, accept: true });
  await waitFor(() => A.inbox.battle_start.length === 1 && B.inbox.battle_start.length === 1, "batalha começa");
  const sa = A.inbox.battle_start[0];
  const sb = B.inbox.battle_start[0];
  assert.equal(sa.pvp, true);
  assert.equal(sa.trainer.name, "Beto");
  assert.equal(sb.trainer.name, "Ana");
  assert.equal(sa.foe.speciesId, "aquari");
  assert.equal(sb.foe.speciesId, "flambo");
  assert.equal(sb.foeCount, 2);
  assert.deepEqual(sa.foe.moves, [], "golpes do adversário ficam escondidos");
  await waitFor(() => A.room.state.players.get(A.room.sessionId).inBattle && B.room.state.players.get(B.room.sessionId).inBattle, "marcados em batalha");
  ok("aceitou: os dois entram na batalha, cada um vê o outro como adversário");

  // ninguém anda nem desafia terceiros durante a batalha
  const posA = { ...A.room.state.players.get(A.room.sessionId) };
  A.room.send("move", { dir: "left", seq: 1 });
  await sleep(150);
  assert.equal(A.room.state.players.get(A.room.sessionId).x, posA.x);

  // Ana troca de criatura enquanto Beto ataca: só resolve com as duas escolhas
  await sleep(350);
  A.room.send("battle_action", { kind: "switch", index: 1 });
  await sleep(300);
  assert.equal(A.inbox.battle_turn.length, 0, "espera o outro escolher");
  B.room.send("battle_action", { kind: "move", moveIndex: 0 });
  await waitFor(() => A.inbox.battle_turn.length === 1 && B.inbox.battle_turn.length === 1, "turno resolvido");
  const ta = A.inbox.battle_turn[0];
  const tb = B.inbox.battle_turn[0];
  assert.equal(ta.events[0].t, "switch");
  assert.equal(tb.events[0].t, "foe_switch");
  assert.equal(tb.events[0].view.speciesId, "chirpy");
  assert.equal(ta.active, 1);
  ok("turno só resolve com as duas escolhas; troca aparece como troca do adversário para o outro");

  // luta até o fim
  for (let i = 0; i < 80; i++) {
    const la = last(A.inbox.battle_turn);
    const lb = last(B.inbox.battle_turn);
    if (la?.over && lb?.over) break;
    const n = A.inbox.battle_turn.length;
    for (const [P, l] of [[A, la], [B, lb]] as const) {
      if (l?.waiting) continue;
      if (l?.needSwitch) P.room.send("battle_action", { kind: "switch", index: l.team.findIndex((c: any) => c.hp > 0) });
      else P.room.send("battle_action", { kind: "move", moveIndex: 0 });
    }
    await waitFor(() => A.inbox.battle_turn.length > n || B.inbox.battle_turn.length > n, "próximo turno");
    await sleep(320);
  }
  const endA = last(A.inbox.battle_turn);
  const endB = last(B.inbox.battle_turn);
  assert.ok(endA.over && endB.over);
  const ra = endA.events.find((e: any) => e.t === "pvp_result");
  const rb = endB.events.find((e: any) => e.t === "pvp_result");
  assert.ok(ra && rb);
  assert.ok((ra.outcome === "win" && rb.outcome === "lose") || (ra.outcome === "lose" && rb.outcome === "win") || ra.outcome === "draw");
  await waitFor(() => !A.room.state.players.get(A.room.sessionId).inBattle && !B.room.state.players.get(B.room.sessionId).inBattle, "fora de batalha");
  await waitFor(() => A.inbox.chat.some((c) => /batalha amistosa/.test(c.text)), "anúncio no chat");
  ok(`batalha termina para os dois (${ra.outcome} × ${rb.outcome}) e o resultado vai para o chat`);

  assert.deepEqual(trainerOf(A.room).team.map((c: any) => c.hp), hpBefore);
  assert.equal(trainerOf(A.room).money, 500);
  ok("batalha amistosa não muda Vida, XP nem Sementes de ninguém");

  // ---------- Desistência ----------
  await sleep(1600);
  B.room.send("social_request", { target: A.room.sessionId, kind: "battle" });
  await waitFor(() => A.inbox.social_request.length === 1, "pedido do Beto");
  A.room.send("social_answer", { from: B.room.sessionId, accept: true });
  await waitFor(() => A.inbox.battle_start.length === 2, "segunda batalha");
  await sleep(350);
  A.room.send("battle_action", { kind: "run" });
  await waitFor(() => last(B.inbox.battle_turn)?.events.some((e: any) => e.t === "pvp_result" && e.reason === "forfeit"), "desistência");
  assert.equal(last(B.inbox.battle_turn).events.find((e: any) => e.t === "pvp_result").outcome, "win");
  ok("desistir dá a vitória ao outro");

  // ---------- Troca ----------
  await sleep(1600);
  A.room.send("social_request", { target: B.room.sessionId, kind: "trade" });
  await waitFor(() => B.inbox.social_request.some((r) => r.kind === "trade"), "pedido de troca");
  B.room.send("social_answer", { from: A.room.sessionId, accept: true });
  await waitFor(() => A.inbox.trade_state.length >= 1 && B.inbox.trade_state.length >= 1, "troca aberta");
  assert.equal(last(A.inbox.trade_state).partner, "Beto");

  const chirpyUid = extra.uid;
  const aquariUid = trainerOf(B.room).team[0].uid;
  A.room.send("trade_offer", { uid: chirpyUid });
  await waitFor(() => last(B.inbox.trade_state)?.theirs?.speciesId === "chirpy", "Beto vê a oferta");
  assert.equal(last(B.inbox.trade_state).theirsCaughtBy, "Ana");
  B.room.send("trade_offer", { uid: "nao-existe" });
  await sleep(150);
  assert.equal(last(A.inbox.trade_state).theirs, null, "criatura de outro não pode ser oferecida");
  B.room.send("trade_offer", { uid: aquariUid });
  await waitFor(() => last(A.inbox.trade_state)?.theirs?.speciesId === "aquari", "Ana vê a oferta");
  A.room.send("trade_confirm");
  await waitFor(() => last(B.inbox.trade_state)?.theirOk === true, "Ana confirmou");
  // Beto muda a oferta: as confirmações caem
  B.room.send("trade_offer", { uid: aquariUid });
  await waitFor(() => last(A.inbox.trade_state)?.myOk === false, "confirmação desfeita");
  ok("ofertas aparecem para o outro (com quem capturou); mudar a oferta desfaz as confirmações");

  // andar durante a troca não vale
  A.room.send("move", { dir: "left", seq: 5 });
  await sleep(150);
  assert.equal(A.room.state.players.get(A.room.sessionId).x, posA.x);

  A.room.send("trade_confirm");
  B.room.send("trade_confirm");
  await waitFor(() => A.inbox.trade_end.length === 1 && B.inbox.trade_end.length === 1, "troca concluída");
  assert.equal(A.inbox.trade_end[0].done, true);
  const ta2 = trainerOf(A.room);
  const tb2 = trainerOf(B.room);
  assert.ok(ta2.team.some((c: any) => c.uid === aquariUid) && !ta2.team.some((c: any) => c.uid === chirpyUid));
  assert.ok(tb2.team.some((c: any) => c.uid === chirpyUid));
  const moved = tb2.team.find((c: any) => c.uid === chirpyUid);
  assert.equal(moved.caughtBy, ta2.id, "continua registrado quem capturou");
  assert.ok(tb2.dex.caught.includes("chirpy") && ta2.dex.caught.includes("aquari"));
  // Beto tinha só o Aquari: continua com time
  assert.equal(tb2.team.length, 1);
  await waitFor(() => last(A.inbox.profile)?.team.some((c: any) => c.uid === aquariUid), "perfil atualizado");
  ok("troca feita: criaturas mudam de dono, dex atualizada e quem capturou fica registrado");

  await sleep(300);
  const file = JSON.parse(readFileSync(dataFile, "utf8"));
  const savedB = Object.values(file.trainers ?? file).find((t: any) => t?.name === "Beto") as any;
  assert.ok(savedB, "Beto salvo");
  assert.ok(savedB.team.some((c: any) => c.uid === chirpyUid));
  ok("troca gravada na hora");

  // ---------- Cancelar e sair no meio ----------
  await sleep(1600);
  B.room.send("social_request", { target: A.room.sessionId, kind: "trade" });
  await waitFor(() => A.inbox.social_request.some((r) => r.kind === "trade" && r.name === "Beto"), "nova troca");
  A.room.send("social_answer", { from: B.room.sessionId, accept: true });
  await waitFor(() => A.inbox.trade_state.length > 0 && last(A.inbox.trade_state).mine === null && A.inbox.trade_end.length === 1, "troca 2 aberta");
  await sleep(100);
  A.room.send("trade_cancel");
  await waitFor(() => B.inbox.trade_end.length === 2, "cancelamento chega");
  assert.match(last(B.inbox.trade_end).text, /cancelou/);
  ok("cancelar fecha a troca dos dois");

  await sleep(1600);
  A.room.send("social_request", { target: B.room.sessionId, kind: "battle" });
  await waitFor(() => B.inbox.social_request.length >= 4, "terceiro desafio");
  B.room.send("social_answer", { from: A.room.sessionId, accept: true });
  await waitFor(() => A.inbox.battle_start.length === 3, "terceira batalha");
  await B.room.leave();
  await waitFor(() => last(A.inbox.battle_turn)?.events.some((e: any) => e.t === "pvp_result" && e.reason === "left"), "vitória por saída");
  await waitFor(() => !A.room.state.players.get(A.room.sessionId).inBattle, "fora de batalha");
  ok("quem sai no meio perde e o outro sai da batalha");

  await A.room.leave();
  await gameServer.gracefullyShutdown(false);
  console.log(`\n${passed} verificações passaram.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFALHOU:", err);
  process.exit(1);
});
