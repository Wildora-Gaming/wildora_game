// Trilhas originais do Wildora, em notação simples:
// cada nota é [nome, duração em semicolcheias]; "-" é pausa. Um compasso = 16.
// Bateria: uma letra por semicolcheia — k bumbo, s caixa, h chimbal, "." nada.

export type Note = [string, number];

export interface Track {
  bpm: number;
  /** melodia principal */
  lead: Note[];
  /** baixo */
  bass: Note[];
  /** acompanhamento (arpejo/harmonia), opcional */
  harmony?: Note[];
  drums?: string;
  loop: boolean;
  /** timbre da melodia */
  leadWave?: "pulse" | "square" | "triangle";
  /** volume relativo da trilha (0–1) */
  level?: number;
  /** transposição em semitons */
  transpose?: number;
}

/** Repete um padrão n vezes. */
const rep = <T,>(arr: T[], n: number): T[] => Array.from({ length: n }, () => arr).flat();

/** Baixo em colcheias na fundamental de cada compasso (com a quinta no fim). */
function walkingBass(roots: string[], style: "eighths" | "quarters" = "eighths"): Note[] {
  const out: Note[] = [];
  for (const r of roots) {
    const [name, oct] = [r.slice(0, -1), Number(r.slice(-1))];
    const fifth = fifthOf(name, oct);
    if (style === "quarters") out.push([r, 4], [fifth, 4], [r, 4], [fifth, 4]);
    else out.push([r, 2], [r, 2], [r, 2], [fifth, 2], [r, 2], [r, 2], [fifth, 2], [r, 2]);
  }
  return out;
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
function fifthOf(name: string, oct: number): string {
  const i = NAMES.indexOf(FLAT[name] ?? name);
  const j = i + 7;
  return `${NAMES[j % 12]}${oct + Math.floor(j / 12)}`;
}

/** Arpejo em semicolcheias com as notas do acorde. */
function arp(chords: string[][], perBar = 16): Note[] {
  const out: Note[] = [];
  for (const c of chords) for (let i = 0; i < perBar; i += 2) out.push([c[(i / 2) % c.length], 2]);
  return out;
}

// ---------------- Vila Broto: alegre, Dó maior ----------------

const villageLead: Note[] = [
  ["E5", 4], ["G5", 2], ["E5", 2], ["D5", 4], ["C5", 4],
  ["D5", 2], ["E5", 2], ["F5", 2], ["E5", 2], ["D5", 8],
  ["E5", 4], ["G5", 2], ["A5", 2], ["G5", 4], ["E5", 4],
  ["F5", 2], ["E5", 2], ["D5", 2], ["B4", 2], ["C5", 8],
  ["A4", 4], ["C5", 2], ["A4", 2], ["G4", 4], ["E4", 4],
  ["F4", 2], ["A4", 2], ["C5", 2], ["A4", 2], ["G4", 8],
  ["E5", 4], ["D5", 2], ["C5", 2], ["D5", 4], ["G4", 4],
  ["C5", 12], ["-", 4],
];
const villageRoots = ["C3", "G2", "A2", "G2", "F2", "F2", "G2", "C3"];
const villageChords = [
  ["C4", "E4", "G4", "E4"], ["B3", "D4", "G4", "D4"], ["A3", "C4", "E4", "C4"], ["B3", "D4", "G4", "D4"],
  ["A3", "C4", "F4", "C4"], ["A3", "C4", "F4", "C4"], ["B3", "D4", "G4", "D4"], ["C4", "E4", "G4", "E4"],
];

export const VILLAGE: Track = {
  bpm: 108,
  lead: villageLead,
  bass: walkingBass(villageRoots, "quarters"),
  harmony: arp(villageChords),
  drums: rep(["k...h...s...h..."], 8).join(""),
  loop: true,
  leadWave: "pulse",
};

/** Noite: a mesma melodia da vila, devagar e suave, sem bateria. */
export const NIGHT: Track = {
  ...VILLAGE,
  bpm: 76,
  drums: undefined,
  leadWave: "triangle",
  level: 1,
  transpose: -5,
};

// ---------------- Rotas: aventura, Ré menor ----------------

const routeLead: Note[] = [
  ["D5", 3], ["D5", 1], ["F5", 2], ["A5", 2], ["G5", 4], ["F5", 4],
  ["E5", 2], ["F5", 2], ["G5", 2], ["A5", 2], ["D5", 8],
  ["C5", 3], ["C5", 1], ["E5", 2], ["G5", 2], ["F5", 4], ["E5", 4],
  ["D5", 2], ["E5", 2], ["F5", 2], ["E5", 2], ["C5", 8],
  ["A#4", 4], ["D5", 2], ["F5", 2], ["A5", 4], ["G5", 4],
  ["F5", 2], ["E5", 2], ["D5", 2], ["E5", 2], ["F5", 8],
  ["G5", 4], ["A5", 2], ["A#5", 2], ["A5", 4], ["G5", 2], ["E5", 2],
  ["D5", 12], ["-", 4],
];
const routeRoots = ["D3", "D3", "C3", "C3", "A#2", "F2", "G2", "D3"];
const routeChords = [
  ["D4", "F4", "A4"], ["D4", "F4", "A4"], ["C4", "E4", "G4"], ["C4", "E4", "G4"],
  ["A#3", "D4", "F4"], ["A3", "C4", "F4"], ["A#3", "D4", "G4"], ["A3", "D4", "F4"],
];

export const ROUTE: Track = {
  bpm: 132,
  lead: routeLead,
  bass: walkingBass(routeRoots),
  harmony: arp(routeChords),
  drums: rep(["k.h.s.h.k.k.s.h."], 8).join(""),
  loop: true,
  leadWave: "pulse",
};

// ---------------- Batalha: rápida, Lá menor ----------------

const battleLead: Note[] = [
  ["A4", 2], ["C5", 2], ["E5", 2], ["A5", 2], ["G5", 2], ["E5", 2], ["C5", 2], ["E5", 2],
  ["F5", 4], ["E5", 2], ["D5", 2], ["E5", 8],
  ["A4", 2], ["C5", 2], ["E5", 2], ["A5", 2], ["B5", 2], ["A5", 2], ["G5", 2], ["E5", 2],
  ["F5", 2], ["G5", 2], ["A5", 2], ["G5", 2], ["E5", 8],
  ["D5", 2], ["F5", 2], ["A5", 2], ["D6", 2], ["C6", 2], ["A5", 2], ["F5", 2], ["A5", 2],
  ["G5", 4], ["F5", 2], ["E5", 2], ["D5", 8],
  ["E5", 2], ["E5", 2], ["F5", 2], ["G5", 2], ["A5", 2], ["G5", 2], ["F5", 2], ["E5", 2],
  ["E5", 4], ["G#5", 4], ["B5", 8],
];
const battleRoots = ["A2", "F2", "A2", "C3", "D3", "G2", "F2", "E2"];
const battleChords = [
  ["A3", "C4", "E4"], ["A3", "C4", "F4"], ["A3", "C4", "E4"], ["C4", "E4", "G4"],
  ["D4", "F4", "A4"], ["B3", "D4", "G4"], ["A3", "C4", "F4"], ["G#3", "B3", "E4"],
];

export const BATTLE: Track = {
  bpm: 156,
  lead: battleLead,
  bass: walkingBass(battleRoots),
  harmony: arp(battleChords),
  drums: rep(["k.hsk.hsk.hsk.hs", "k.hsk.hsk.hsk.ss"], 4).join(""),
  loop: true,
  leadWave: "square",
};

/** Ginásio e batalha entre jogadores: a batalha, um tom acima e mais rápida. */
export const GYM: Track = { ...BATTLE, bpm: 168, transpose: 2 };

// ---------------- Vinhetas ----------------

export const VICTORY: Track = {
  bpm: 150,
  lead: [["C5", 2], ["E5", 2], ["G5", 2], ["C6", 6], ["A5", 2], ["B5", 2], ["C6", 12], ["-", 4]],
  bass: [["C3", 4], ["G2", 4], ["C3", 4], ["F2", 4], ["G2", 4], ["C3", 12]],
  harmony: [["E4", 4], ["G4", 4], ["E4", 4], ["A4", 4], ["B4", 4], ["G4", 12]],
  level: 1.4,
  loop: false,
  leadWave: "square",
};

export const HEAL: Track = {
  bpm: 160,
  lead: [["C5", 2], ["E5", 2], ["G5", 2], ["C6", 2], ["G5", 2], ["C6", 6], ["-", 4]],
  bass: [["C3", 16], ["-", 4]],
  level: 1.4,
  loop: false,
  leadWave: "triangle",
};

export const LEVEL_UP: Track = {
  bpm: 200,
  lead: [["G5", 2], ["A5", 2], ["B5", 2], ["D6", 6], ["-", 4]],
  bass: [["G3", 12], ["-", 4]],
  level: 1.4,
  loop: false,
  leadWave: "pulse",
};

export const EVOLVE: Track = {
  bpm: 120,
  lead: [["C5", 2], ["G5", 2], ["C6", 2], ["E6", 2], ["D6", 2], ["G6", 2], ["C7", 8], ["-", 4]],
  bass: [["C3", 8], ["G3", 4], ["C4", 8], ["-", 4]],
  harmony: [["E4", 4], ["G4", 4], ["B4", 4], ["C5", 8], ["-", 4]],
  level: 1.4,
  loop: false,
  leadWave: "pulse",
};

export const CAUGHT: Track = {
  bpm: 170,
  lead: [["G5", 2], ["C6", 2], ["E6", 2], ["G6", 2], ["E6", 2], ["G6", 8], ["-", 4]],
  bass: [["C3", 4], ["E3", 4], ["G3", 4], ["C3", 8], ["-", 4]],
  level: 1.4,
  loop: false,
  leadWave: "square",
};
