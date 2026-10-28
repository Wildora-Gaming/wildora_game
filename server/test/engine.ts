// Testes unitários do motor de batalha (sem rede).
import assert from "node:assert/strict";
import { TYPE_IDS, effectiveness, typeMultiplier } from "../../shared/battle/types";
import { SPECIES } from "../../shared/battle/data";
import {
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
  assert.deepEqual(createCreature("leafin", 5).moves, ["investida", "chicote_de_rama"]);
  assert.deepEqual(createCreature("leafin", 12).moves, [
    "investida",
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
  const state = startBattle(chirpy, zappi);
  const rasante = chirpy.moves.indexOf("rasante");
  const events = resolveTurn(state, { kind: "move", moveIndex: rasante }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  const first = events.find((e) => e.t === "use") as Extract<BattleEvent, { t: "use" }>;
  assert.equal(first.side, "player");
});

test("Pólen Sonolento adormece e o alvo perde o turno seguinte", () => {
  const leafin = createCreature("leafin", 7);
  const pawly = createCreature("pawly", 5);
  const state = startBattle(leafin, pawly);
  const polen = leafin.moves.indexOf("polen_sonolento");
  resolveTurn(state, { kind: "move", moveIndex: polen }, { kind: "move", moveIndex: 0 }, fixed(0.1));
  assert.equal(pawly.status, "adormecido");
  const e2 = resolveTurn(state, { kind: "move", moveIndex: 0 }, { kind: "move", moveIndex: 0 }, fixed(0.5));
  assert.ok(e2.some((e) => e.t === "skip" && e.side === "foe"));
});

test("fuga garantida quando muito mais rápido", () => {
  const state = startBattle(createCreature("zappi", 30), createCreature("rocky", 2));
  const events = resolveTurn(state, { kind: "run" }, { kind: "move", moveIndex: 0 }, fixed(0.99));
  assert.deepEqual(events, [{ t: "run", ok: true }, { t: "end", result: "ran" }]);
});

test("200 batalhas aleatórias terminam e mantêm Vida coerente", () => {
  const ids = Object.keys(SPECIES);
  for (let i = 0; i < 200; i++) {
    const rng = seeded(i + 1);
    const p = createCreature(ids[i % ids.length], 2 + (i % 9));
    const f = createCreature(ids[(i * 7) % ids.length], 2 + ((i * 3) % 9));
    const state = startBattle(p, f);
    let turns = 0;
    while (!state.result) {
      const events = resolveTurn(state, chooseWildAction({ ...state, foe: p }, rng), chooseWildAction(state, rng), rng);
      for (const e of events) {
        if (e.t === "damage" || e.t === "tick") assert.ok(e.hp >= 0 && e.hp <= e.maxHp);
        assert.notEqual(describeEvent(e, { player: "A", foe: "B" }), undefined);
      }
      assert.ok(++turns < 300, "batalha sem fim");
    }
    assert.ok(p.hp === 0 || f.hp === 0);
  }
});

test("XP sobe de nível e ensina golpe novo", () => {
  const leafin = createCreature("leafin", 5);
  assert.equal(xpReward(createCreature("pawly", 2)), 20);
  assert.deepEqual(gainXp(leafin, 100), { levels: [6], learned: [] });
  const r = gainXp(leafin, 200);
  assert.deepEqual(r, { levels: [7], learned: ["polen_sonolento"] });
  assert.equal(leafin.moves.length, 3);
  assert.ok(leafin.hp <= calcStats(leafin).maxHp);
});

console.log(`\n${passed} verificações passaram.\n`);
