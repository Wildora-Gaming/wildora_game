// Personagens do mundo: Corretora do Mercado, quem troca criaturas, quem dá missões,
// treinadores na estrada e os lugares por onde o Mercador viajante passa.
// As posições ficam ao lado das estradas do mundo 2 (ver shared/map.ts).
import type { Direction } from "./constants";

export type NpcRole = "market" | "swap" | "quest" | "road";

/** Tarefa de uma missão. zone = nome da região (onde a batalha aconteceu). */
export type QuestTask =
  | { kind: "catch"; count: number; species?: string; zone?: string }
  | { kind: "win"; count: number; zone?: string }
  | { kind: "road"; count: number };

export interface Quest {
  /** o que o NPC pede (aparece na conversa) */
  ask: string;
  task: QuestTask;
  reward: { money?: number; items?: Record<string, number> };
  /** fala ao entregar a recompensa */
  thanks: string;
}

export interface Npc {
  id: string;
  name: string;
  /** aparência (ver shared/avatar/look.ts) */
  look: string;
  x: number;
  y: number;
  face: Direction;
  role: NpcRole;
  /** fala de apresentação */
  hello: string;
  /** troca: pede uma espécie e dá outra, no mesmo nível */
  swap?: { want: string; give: string };
  /** missões em sequência */
  quests?: Quest[];
  /** treinador da estrada: time e prêmio */
  team?: [string, number][];
}

export const NPCS: Npc[] = [
  // ---------- Vila Broto ----------
  {
    id: "livia",
    name: "Lívia",
    look: "1.4.2.1.3.2.8.2.4.6.0.0",
    x: 132, y: 98, face: "down", role: "market",
    hello: "Sou a corretora do Mercado. Aqui você anuncia criaturas e itens para outros treinadores, e compra o que eles anunciaram.",
  },
  {
    id: "ana",
    name: "Profa. Ana",
    look: "2.5.5.1.1.3.1.1.6.3.0.0",
    x: 122, y: 104, face: "right", role: "quest",
    hello: "Eu estudo as criaturas de Wildora e preciso de ajuda em campo.",
    quests: [
      { ask: "Capture 3 criaturas, de qualquer tipo.", task: { kind: "catch", count: 3 }, reward: { money: 300, items: { orbi_prata: 3 } }, thanks: "Ótimo começo! Leve estes Orbis Prata." },
      { ask: "Vença 10 criaturas selvagens.", task: { kind: "win", count: 10 }, reward: { money: 500, items: { super_pocao: 2 } }, thanks: "Seu time está ficando forte. Tome, para as próximas batalhas." },
      { ask: "Capture um Frostitt na Planície Gelada, ao norte.", task: { kind: "catch", count: 1, species: "frostitt" }, reward: { money: 1000, items: { doce_estelar: 1 } }, thanks: "Um Frostitt! Que pelagem incrível. Aqui está um Doce Estelar." },
      { ask: "Vença 3 treinadores na estrada.", task: { kind: "road", count: 3 }, reward: { money: 2000, items: { orbi_ouro: 1 } }, thanks: "Já ouvi falar de você pelas estradas! Este Orbi Ouro é seu." },
    ],
  },
  {
    id: "juca",
    name: "Seu Juca",
    look: "3.0.8.0.0.0.10.0.11.11.1.10",
    x: 136, y: 94, face: "left", role: "swap",
    hello: "Sempre quis um Pawly para me fazer companhia.",
    swap: { want: "pawly", give: "bubblit" },
  },
  // ---------- Campos do Leste ----------
  {
    id: "rita",
    name: "Rita",
    look: "0.3.6.1.2.0.9.1.5.9.0.0",
    x: 175, y: 107, face: "up", role: "swap",
    hello: "Os Woolly daqui têm a lã mais macia. Troco por uma criatura do gelo que eu trouxe do norte.",
    swap: { want: "woolly", give: "frostitt" },
  },
  // ---------- Costa dos Recifes ----------
  {
    id: "tiao",
    name: "Tião",
    look: "4.1.0.0.2.0.5.0.6.5.1.5",
    x: 211, y: 153, face: "up", role: "swap",
    hello: "Pesco Bubblit faz anos, mas nunca peguei um para mim. Te dou uma Petallia do bosque.",
    swap: { want: "bubblit", give: "petallia" },
  },
  {
    id: "iza",
    name: "Capitã Iza",
    look: "1.3.7.1.2.2.5.1.6.9.0.5",
    x: 201, y: 152, face: "up", role: "quest",
    hello: "O mar anda agitado. Preciso de treinadores corajosos na costa.",
    quests: [
      { ask: "Vença 10 criaturas na Costa dos Recifes.", task: { kind: "win", count: 10, zone: "Costa dos Recifes" }, reward: { items: { hiper_pocao: 3 } }, thanks: "A praia ficou mais calma. Leve estas Hiper Poções." },
      { ask: "Capture uma Slitheria.", task: { kind: "catch", count: 1, species: "slitheria" }, reward: { items: { orbi_ouro: 1 } }, thanks: "Que bela Slitheria! Um Orbi Ouro para você." },
      { ask: "Capture 5 criaturas na Costa dos Recifes.", task: { kind: "catch", count: 5, zone: "Costa dos Recifes" }, reward: { money: 3000, items: { doce_estelar: 1 } }, thanks: "Você conhece este mar como ninguém." },
    ],
  },
  // ---------- Encosta Vulcânica ----------
  {
    id: "bruna",
    name: "Bruna",
    look: "2.5.1.1.1.3.12.1.13.12.0.0",
    x: 61, y: 153, face: "up", role: "swap",
    hello: "Ferreira que se preze tem um Ironclad. Troco por uma Spinora do gelo.",
    swap: { want: "ironclad", give: "spinora" },
  },
  // ---------- Bosque Encantado ----------
  {
    id: "salvia",
    name: "Dona Sálvia",
    look: "0.4.0.1.5.1.7.2.11.7.0.0",
    x: 212, y: 48, face: "down", role: "swap",
    hello: "As folhas sombrias me fazem companhia à noite. Traga uma Shadeleaf e te dou um Aurabit.",
    swap: { want: "shadeleaf", give: "aurabit" },
  },
  {
    id: "ravi",
    name: "Guardião Ravi",
    look: "0.0.5.2.5.3.7.0.11.11.1.7",
    x: 220, y: 42, face: "left", role: "quest",
    hello: "Eu cuido deste bosque. Me ajude a conhecer quem vive aqui.",
    quests: [
      { ask: "Capture 3 criaturas no Bosque Encantado.", task: { kind: "catch", count: 3, zone: "Bosque Encantado" }, reward: { items: { doce_estelar: 2 } }, thanks: "Elas confiam em você. Dois Doces Estelares!" },
      { ask: "Vença 15 criaturas no Bosque Encantado.", task: { kind: "win", count: 15, zone: "Bosque Encantado" }, reward: { money: 2500 }, thanks: "O bosque está em paz. Obrigado." },
      { ask: "Capture uma Shadeleaf (só aparece à noite).", task: { kind: "catch", count: 1, species: "shadeleaf" }, reward: { items: { orbi_ouro: 2 } }, thanks: "Raríssima! Leve dois Orbis Ouro." },
    ],
  },
  // ---------- Treinadores na estrada ----------
  {
    id: "estrada_leste", name: "Léo", look: "3.1.4.0.0.0.0.0.11.0.1.0",
    x: 148, y: 99, face: "left", role: "road",
    hello: "Ei, você! Treinador que passa por aqui tem que batalhar comigo!",
    team: [["zebri", 14], ["woolly", 15]],
  },
  {
    id: "estrada_norte", name: "Carla", look: "1.5.3.3.4.3.2.2.11.2.0.0",
    x: 112, y: 48, face: "left", role: "road",
    hello: "Daqui para o norte só passa quem me vencer!",
    team: [["chirpy", 13], ["rocky", 14], ["zappi", 14]],
  },
  {
    id: "estrada_sul", name: "Tadeu", look: "5.0.0.0.0.0.13.0.12.12.1.13",
    x: 127, y: 130, face: "right", role: "road",
    hello: "Minhas criaturas treinam o dia todo nesta pradaria. Vamos ver as suas!",
    team: [["zebri", 16], ["rockor", 17]],
  },
  {
    id: "estrada_oeste", name: "Bia", look: "2.3.1.1.1.0.12.1.13.12.0.0",
    x: 101, y: 98, face: "down", role: "road",
    hello: "O bosque é meu território. Mostra o que sabe!",
    team: [["sprouty", 16], ["shroomy", 17], ["leafox", 18]],
  },
  {
    id: "estrada_bosque", name: "Nico", look: "4.6.0.3.0.1.12.0.12.12.0.0",
    x: 79, y: 117, face: "left", role: "road",
    hello: "Quem atravessa o bosque escuro precisa de coragem. E de batalha!",
    team: [["batto", 19], ["shroomy", 20], ["sprouty", 20]],
  },
  {
    id: "estrada_lago", name: "Jade", look: "1.4.6.1.2.1.9.2.5.9.0.0",
    x: 196, y: 124, face: "right", role: "road",
    hello: "Caminho para a costa? Antes, uma batalha!",
    team: [["nimblo", 23], ["marinor", 24], ["voltuga", 25]],
  },
  {
    id: "estrada_gelo", name: "Igor", look: "3.0.5.2.0.1.10.0.12.12.1.10",
    x: 109, y: 42, face: "right", role: "road",
    hello: "O frio deixa as criaturas mais fortes. Prova disso: as minhas!",
    team: [["frostorr", 32], ["zephiro", 33], ["zefril", 34]],
  },
  {
    id: "estrada_encantado", name: "Luna", look: "0.4.7.1.2.1.5.2.6.5.0.0",
    x: 209, y: 88, face: "right", role: "road",
    hello: "O Bosque Encantado não recebe qualquer um. Me vença primeiro.",
    team: [["musgaroo", 35], ["tanglora", 36], ["bellunis", 38]],
  },
  {
    id: "estrada_vulcao", name: "Rubens", look: "4.4.4.3.1.1.0.0.11.11.0.0",
    x: 44, y: 170, face: "right", role: "road",
    hello: "Calor de vulcão forja campeões. Vamos!",
    team: [["ignurso", 42], ["lamudo", 43], ["pyraxor", 45]],
  },
];

/** Lugares por onde o Mercador viajante monta a barraca (ao lado das estradas). */
export const MERCHANT_SPOTS: { x: number; y: number; region: string }[] = [
  { x: 159, y: 99, region: "Campos do Leste" },
  { x: 112, y: 34, region: "Planície Gelada" },
  { x: 200, y: 130, region: "Campos do Leste" },
  { x: 79, y: 129, region: "Orla do Bosque" },
  { x: 210, y: 60, region: "Bosque Encantado" },
  { x: 134, y: 139, region: "Pradaria Sul" },
];
export const MERCHANT = { name: "Mercador Bento", look: "3.0.8.0.0.3.4.0.11.11.2.4" };

/** Treinadores da estrada: prêmio em Sementes. */
export const roadReward = (npc: Npc) => 40 * Math.max(...(npc.team ?? [["", 1]]).map(([, l]) => l));

export const getNpc = (id: unknown) => NPCS.find((n) => n.id === id);

/** Dia (desde 1970, no horário de Brasília) para os desafios diários. */
export const dayNumber = (ms: number) => Math.floor((ms - 3 * 3600_000) / 86_400_000);
