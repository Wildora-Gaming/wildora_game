// Testes unitários do motor de batalha (sem rede).
import assert from "node:assert/strict";
import { TYPE_IDS, effectiveness, typeMultiplier } from "../../shared/battle/types";
import { SPECIES } from "../../shared/battle/data";
import {
  chooseTrainerAction,
  awardExperience,
  catchChance,
  evolveIfReady,
  isValidAction,
  calcDamage,
  calcStats,
  chooseWildAction,
  createCreature,
  gainXp,
  resolveTurn,
  startBattle,
  xpReward,
  type BattleEvent,
} from "../../shared/battle/engine";
import { describeEvent } from "../../shared/battle/text";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** RNG determinístico com semente. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** RNG que devolve a sequência dada e depois repete o último valor. */
function fixed(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

console.log("Motor de batalha");

test("cada tipo é fraco contra exatamente 2 tipos, sem imunidades", () => {
  for (const def of TYPE_IDS) {
    const weak = TYPE_IDS.filter((att) => typeMultiplier(att, def) === 2);
    assert.equal(weak.length, 2, `${def} fraco contra ${weak.join(",")}`);
    for (const att of TYPE_IDS) assert.ok(typeMultiplier(att, def) > 0);
  }
});

test("tabela bate com o documento (amostras)", () => {
  assert.equal(typeMultiplier("flora", "mare"), 2);
  assert.equal(typeMultiplier("mare", "brasa"), 2);
  assert.equal(typeMultiplier("brasa", "flora"), 2);
  assert.equal(typeMultiplier("fera", "espectro"), 0.5);
  assert.equal(typeMultiplier("pedra", "faisca"), 2);
  assert.equal(effectiveness("mare", ["espectro", "brasa"]), 2);
});

test("todas as espécies têm golpes válidos no nível 1", () => {
  for (const id of Object.keys(SPECIES)) {
    const c = createCreature(id, 1);
    assert.ok(c.moves.length >= 1, id);
    assert.ok(c.hp > 0);
  }
});

test("atributos no nível 5 seguem a fórmula", () => {
  assert.deepEqual(calcStats({ speciesId: "leafin", level: 5 }), { maxHp: 20, atk: 9, def: 11, spe: 8 });
});

test("golpes por nível: os 4 últimos aprendidos", () => {
  assert.deepEqual(createCreature("leafin", 5).moves, ["patada", "chicote_de_rama"]);
  assert.deepEqual(createCreature("leafin", 12).moves, [
    "patada",
    "chicote_de_rama",
    "polen_sonolento",
    "mordida_firme",
  ]);
});

test("fórmula de dano com vantagem de tipo e mesmo tipo", () => {
  const leafin = createCreature("leafin", 5);
  const rocky = createCreature("rocky", 5);
  // rng: 0.5 = sem crítico, 0 = variação mínima 0,85
  const r = calcDamage(leafin, rocky, "chicote_de_rama", fixed(0.5, 0));
  assert.deepEqual(r, { amount: 10, eff: 2, crit: false });
});

test("Rasante age primeiro mesmo sendo mais lento", () => {
  const chirpy = createCreature("chirpy", 5);
  const zappi = createCreature("zappi", 30); // muito mais rápido
  const state = startBattle([chirpy], zappi);
  const rasante = chirpy.moves.indexOf("rasante");
  const events = resolveTurn(state, { kind: "move", moveIndex: rasante }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  const first = events.find((e) => e.t === "use") as Extract<BattleEvent, { t: "use" }>;
  assert.equal(first.side, "player");
});

test("Pólen Sonolento adormece e o alvo perde o turno seguinte", () => {
  const leafin = createCreature("leafin", 7);
  const pawly = createCreature("pawly", 5);
  const state = startBattle([leafin], pawly);
  const polen = leafin.moves.indexOf("polen_sonolento");
  resolveTurn(state, { kind: "move", moveIndex: polen }, { kind: "move", moveIndex: 0 }, fixed(0.1));
  assert.equal(pawly.status, "adormecido");
  const e2 = resolveTurn(state, { kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  assert.ok(e2.some((e) => e.t === "skip" && e.side === "foe"));
});

test("fuga garantida quando muito mais rápido", () => {
  const state = startBattle([createCreature("zappi", 30)], createCreature("rocky", 2));
  const events = resolveTurn(state, { kind: "run" }, { kind: "move", moveIndex: 0 }, fixed(0.99));
  assert.deepEqual(events, [{ t: "run", ok: true }, { t: "end", result: "ran" }]);
});

test("200 batalhas aleatórias terminam e mantêm Vida coerente", () => {
  const ids = Object.keys(SPECIES);
  for (let i = 0; i < 200; i++) {
    const rng = seeded(i + 1);
    const p = createCreature(ids[i % ids.length], 2 + (i % 9));
    const f = createCreature(ids[(i * 7) % ids.length], 2 + ((i * 3) % 9));
    const state = startBattle([p], f);
    let turns = 0;
    while (!state.result) {
      const events = resolveTurn(state, { kind: "move", moveIndex: Math.floor(rng() * p.moves.length) }, chooseWildAction(state, rng), rng);
      for (const e of events) {
        if (e.t === "damage" || e.t === "tick") assert.ok(e.hp >= 0 && e.hp <= e.maxHp);
        assert.notEqual(describeEvent(e, { player: "A", foe: "B" }), undefined);
      }
      assert.ok(++turns < 300, "batalha sem fim");
    }
    assert.ok(p.hp === 0 || f.hp === 0 || state.result === "ran");
  }
});

test("XP sobe de nível e ensina golpe novo", () => {
  const leafin = createCreature("leafin", 5);
  assert.equal(xpReward(createCreature("pawly", 2)), 60); // 50 × 2 × 3 ÷ 5
  assert.equal(xpReward(createCreature("pawly", 2), true), 90); // treinador: ×1,5
  assert.deepEqual(gainXp(leafin, 100), { levels: [6], learned: [] });
  const r = gainXp(leafin, 200);
  assert.deepEqual(r, { levels: [7], learned: ["polen_sonolento"] });
  assert.equal(leafin.moves.length, 3);
  assert.ok(leafin.hp <= calcStats(leafin).maxHp);
});

test("captura: chance cresce com Vida baixa e Orbi melhor", () => {
  const foe = createCreature("pawly", 5);
  const full = catchChance(foe, 1);
  foe.hp = 1;
  assert.ok(catchChance(foe, 1) > full * 2);
  assert.ok(catchChance(foe, 1.5) > catchChance(foe, 1));
  foe.status = "adormecido";
  assert.equal(catchChance(foe, 2), 1);
});

test("Orbi captura e encerra a batalha", () => {
  const foe = createCreature("pawly", 3);
  foe.hp = 1;
  foe.status = "adormecido";
  const state = startBattle([createCreature("leafin", 5)], foe);
  const events = resolveTurn(state, { kind: "item", itemId: "orbi_ouro" }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  assert.deepEqual(events.map((e) => e.t), ["throw", "shake", "caught", "end"]);
  assert.equal(state.result, "caught");
});

test("Orbi falho: criatura escapa e o inimigo ataca", () => {
  const state = startBattle([createCreature("leafin", 5)], createCreature("shado", 6));
  const events = resolveTurn(state, { kind: "item", itemId: "orbi" }, { kind: "move", moveIndex: 0 }, fixed(0.99, 0.2, 0.5));
  assert.deepEqual(events.slice(0, 3).map((e) => e.t), ["throw", "shake", "escape"]);
  assert.ok(events.some((e) => e.t === "use" && e.side === "foe"));
  assert.equal(state.result, null);
});

test("desmaio com time reserva pede troca e o inimigo não age na troca forçada", () => {
  const weak = createCreature("chirpy", 2);
  weak.hp = 1;
  const reserve = createCreature("rocky", 10);
  const state = startBattle([weak, reserve], createCreature("zappi", 12));
  resolveTurn(state, { kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 1 }, fixed(0.5));
  assert.equal(state.result, null);
  assert.equal(state.needSwitch, true);
  assert.equal(isValidAction(state, { kind: "move", moveIndex: 0 }), false);
  assert.equal(isValidAction(state, { kind: "switch", index: 0 }), false, "não pode voltar o desmaiado");
  const ev = resolveTurn(state, { kind: "switch", index: 1 }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  assert.deepEqual(ev.map((e) => e.t), ["switch"]);
  assert.equal(state.active, 1);
  assert.equal(state.needSwitch, false);
});

test("derrota só quando o time inteiro desmaia", () => {
  const a = createCreature("chirpy", 2);
  a.hp = 1;
  const state = startBattle([a], createCreature("zappi", 12));
  resolveTurn(state, { kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 1 }, fixed(0.5));
  assert.equal(state.result, "lose");
});

test("Poção recupera Vida em batalha", () => {
  const c = createCreature("aquari", 10);
  c.hp = 5;
  const state = startBattle([c], createCreature("pawly", 2));
  assert.equal(isValidAction(state, { kind: "item", itemId: "pocao" }), true);
  const ev = resolveTurn(state, { kind: "item", itemId: "pocao" }, { kind: "move", moveIndex: 0 }, fixed(0.99));
  const heal = ev[0] as Extract<BattleEvent, { t: "heal" }>;
  assert.equal(heal.t, "heal");
  assert.equal(heal.amount, 20);
});

test("evolução no nível certo mantém o dano sofrido", () => {
  const c = createCreature("leafin", 15);
  c.hp -= 5;
  assert.equal(evolveIfReady(c), null);
  gainXp(c, 16 ** 3 - c.xp);
  const evo = evolveIfReady(c);
  assert.deepEqual(evo, { from: "leafin", to: "leafox" });
  assert.equal(c.hp, calcStats(c).maxHp - 5);
});

test("XP é dividido entre quem participou e está de pé", () => {
  const a = createCreature("leafin", 5);
  const b = createCreature("rocky", 5);
  const state = startBattle([a, b], createCreature("pawly", 10));
  resolveTurn(state, { kind: "switch", index: 1 }, { kind: "move", moveIndex: 0 }, fixed(0.99));
  state.result = "win";
  const ev = awardExperience(state);
  const xp = ev.filter((e) => e.t === "xp");
  assert.equal(xp.length, 2);
});

test("treinador: manda a próxima criatura, XP a cada uma, vitória só no fim", () => {
  const hero = createCreature("flambo", 30);
  const a = createCreature("sprouty", 3);
  const b = createCreature("pawly", 3);
  const state = startBattle([hero], [a, b], false);
  const e1 = resolveTurn(state, { kind: "move", moveIndex: hero.moves.indexOf("labareda") }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  const kinds1 = e1.map((e) => e.t);
  assert.ok(kinds1.includes("faint") && kinds1.includes("xp") && kinds1.includes("foe_switch"), kinds1.join(","));
  assert.equal(state.result, null);
  assert.equal(state.foe, b);
  const e2 = resolveTurn(state, { kind: "move", moveIndex: hero.moves.indexOf("labareda") }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  assert.equal(state.result, "win");
  assert.equal(e2.at(-1)?.t, "end");
  assert.ok(e2.some((e) => e.t === "xp"));
});

test("treinador: sem fuga e sem Orbi", () => {
  const state = startBattle([createCreature("leafin", 5)], [createCreature("pawly", 5)], false);
  assert.equal(isValidAction(state, { kind: "run" }), false);
  assert.equal(isValidAction(state, { kind: "item", itemId: "orbi" }), false);
});

test("treinador esperto escolhe o golpe super efetivo", () => {
  const foe = createCreature("aquari", 20); // Investida, Jato d'Água, Mordida Firme, Onda
  const state = startBattle([createCreature("flambo", 20)], [foe], false);
  const a = chooseTrainerAction(state, fixed(0), 1) as { kind: "move"; moveIndex: number };
  assert.equal(foe.moves[a.moveIndex], "onda");
});

test("evolução só acontece no fim da batalha", () => {
  const hero = createCreature("leafin", 15);
  hero.xp = 16 ** 3 - 1;
  const state = startBattle([hero], [createCreature("pawly", 10), createCreature("pawly", 10)], false);
  resolveTurn(state, { kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 0 }, () => 0.5);
  for (let i = 0; i < 30 && !state.result; i++) {
    resolveTurn(state, { kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 0 }, () => 0.5);
    if (state.result === null) assert.equal(hero.speciesId, "leafin", "não evolui no meio");
  }
  if (state.result === "win") assert.equal(hero.speciesId, "leafox");
});

console.log(`\n${passed} verificações passaram.\n`);
