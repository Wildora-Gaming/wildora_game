// Ginásios: um de cada tipo, cada um com dois treinadores e o líder.
// O desafio é em sequência, sem curar entre as lutas. Vencer o líder dá a insígnia.
import type { TypeId } from "./battle/types";

export interface GymTrainer {
  name: string;
  title: string;
  /** aparência na forma compacta (ver shared/avatar/look.ts) */
  look: string;
  team: [string, number][];
  /** Sementes ao vencer */
  reward: number;
  /** chance de escolher o melhor golpe (0–1) */
  smart: number;
}

export interface Gym {
  id: string;
  name: string;
  type: TypeId;
  badge: string;
  /** nível sugerido para tentar */
  level: number;
  /** fala do líder ao lado da porta */
  quote: string;
  trainers: GymTrainer[];
  leader: GymTrainer;
  /** itens dados na primeira vitória sobre o líder */
  prize: Record<string, number>;
}

// Ordem dos campos do visual: pele.cabelo.corCabelo.olhos.corOlhos.roupa.corRoupa.baixo.corBaixo.sapato.chapéu.corChapéu
const t = (name: string, title: string, look: string, team: [string, number][], smart = 0.6): GymTrainer => {
  const top = Math.max(...team.map(([, lvl]) => lvl));
  return { name, title, look, team, reward: 40 * top, smart };
};
const leader = (name: string, look: string, team: [string, number][]): GymTrainer => ({
  ...t(name, "Líder", look, team, 0.85),
  reward: 100 * Math.max(...team.map(([, lvl]) => lvl)),
});

/** Nível máximo das criaturas que entram no ginásio: 5 acima do nível dele. */
export const GYM_LEVEL_MARGIN = 5;
export const gymLevelCap = (gym: Gym) => gym.level + GYM_LEVEL_MARGIN;

export const GYMS: Gym[] = [
  {
    id: "fera",
    name: "Ginásio Garra",
    type: "fera",
    badge: "Insígnia Garra",
    level: 10,
    quote: "Aqui a gente luta no instinto. Mostra do que o seu time é feito!",
    trainers: [
      t("Bia", "Treinadora", "2.3.1.1.1.0.12.1.13.12.0.0", [["pawly", 7], ["zebri", 7]]),
      t("Caio", "Treinador", "3.0.0.0.0.3.10.0.11.11.1.12", [["zebri", 8], ["pawly", 8]]),
    ],
    leader: leader("Duda", "4.6.0.3.0.1.12.0.12.12.0.0", [["pawly", 9], ["zebri", 10], ["pawly", 11]]),
    prize: { orbi_prata: 2, doce_estelar: 1 },
  },
  {
    id: "flora",
    name: "Ginásio Raiz",
    type: "flora",
    badge: "Insígnia Folha",
    level: 15,
    quote: "Toda semente vira árvore com paciência. Você tem paciência?",
    trainers: [
      t("Lia", "Treinadora", "0.4.9.1.3.0.3.2.4.3.0.3", [["sprouty", 10], ["leafin", 10]]),
      t("Téo", "Treinador", "1.0.1.0.3.3.4.0.12.12.2.4", [["shroomy", 11], ["sprouty", 11]]),
    ],
    leader: leader("Iara", "2.4.9.3.3.1.3.0.12.3.0.0", [["sprouty", 14], ["shroomy", 14], ["leafox", 16]]),
    prize: { orbi_prata: 2, super_pocao: 1, doce_estelar: 1 },
  },
  {
    id: "mare",
    name: "Ginásio Correnteza",
    type: "mare",
    badge: "Insígnia Gota",
    level: 19,
    quote: "A maré sempre volta. E volta mais forte.",
    trainers: [
      t("Nina", "Treinadora", "1.3.7.1.2.2.5.1.6.9.0.5", [["aquari", 15], ["baleo", 14]]),
      t("Davi", "Treinador", "4.1.0.0.2.0.5.0.6.5.1.5", [["baleo", 16], ["aquari", 15]]),
    ],
    leader: leader("Marina", "0.4.7.1.2.1.5.2.6.5.0.0", [["aquarel", 17], ["baleo", 18], ["aquarel", 19]]),
    prize: { orbi_prata: 3, super_pocao: 1, doce_estelar: 1 },
  },
  {
    id: "faisca",
    name: "Ginásio Voltagem",
    type: "faisca",
    badge: "Insígnia Faísca",
    level: 22,
    quote: "Fica ligado: aqui ninguém pisca!",
    trainers: [
      t("Zeca", "Treinador", "2.1.3.0.0.0.2.0.11.2.1.2", [["zappi", 18], ["woolly", 18]]),
      t("Lara", "Treinadora", "1.5.3.3.4.3.2.2.11.2.0.0", [["woolly", 19], ["zapix", 19]]),
    ],
    leader: leader("Raio", "3.1.3.2.0.1.2.0.11.11.2.2", [["woolly", 21], ["zapix", 21], ["zapix", 22]]),
    prize: { orbi_prata: 3, super_pocao: 2, doce_estelar: 1 },
  },
  {
    id: "pedra",
    name: "Ginásio Rochedo",
    type: "pedra",
    badge: "Insígnia Rocha",
    level: 25,
    quote: "Pedra mole em pedra dura... não, aqui nada amolece.",
    trainers: [
      t("Gui", "Treinador", "5.0.0.0.0.0.13.0.12.12.1.13", [["rocky", 21], ["shroomy", 21]]),
      t("Rosa", "Treinadora", "2.5.1.1.1.3.12.1.13.12.0.0", [["rockor", 22], ["rocky", 22]]),
    ],
    leader: leader("Pedro Brita", "3.0.5.2.0.1.10.0.12.12.1.10", [["shroomy", 24], ["rockor", 24], ["rockor", 25]]),
    prize: { orbi_prata: 3, super_pocao: 2, doce_estelar: 1 },
  },
  {
    id: "vento",
    name: "Ginásio Ventania",
    type: "vento",
    badge: "Insígnia Pena",
    level: 28,
    quote: "Sente o vento? Ele está do meu lado.",
    trainers: [
      t("Lu", "Treinadora", "0.3.6.1.2.0.9.1.5.9.0.0", [["chirpy", 24], ["fluffi", 24]]),
      t("Beto", "Treinador", "1.1.6.0.2.3.9.0.5.9.2.5", [["batto", 25], ["fluffi", 25]]),
    ],
    leader: leader("Brisa", "1.4.6.1.2.1.9.2.5.9.0.0", [["fluffi", 27], ["batto", 27], ["chirpy", 28]]),
    prize: { orbi_ouro: 1, super_pocao: 2, doce_estelar: 1 },
  },
  {
    id: "brasa",
    name: "Ginásio Fornalha",
    type: "brasa",
    badge: "Insígnia Chama",
    level: 32,
    quote: "Se não aguenta o calor, sai da fornalha!",
    trainers: [
      t("Tito", "Treinador", "3.1.4.0.0.0.0.0.11.0.1.0", [["flambo", 27], ["shado", 27]]),
      t("Mel", "Treinadora", "1.3.4.1.1.3.1.2.11.0.0.0", [["flamber", 28], ["shado", 28]]),
    ],
    leader: leader("Tainá", "4.4.4.3.1.1.0.0.11.11.0.0", [["shado", 30], ["flamber", 31], ["flamberus", 33]]),
    prize: { orbi_ouro: 1, super_pocao: 3, doce_estelar: 1 },
  },
  {
    id: "espectro",
    name: "Ginásio Assombro",
    type: "espectro",
    badge: "Insígnia Sombra",
    level: 36,
    quote: "Psiu... ouviu isso? Era o seu time tremendo.",
    trainers: [
      t("Vini", "Treinador", "0.0.5.2.5.3.7.0.11.11.1.7", [["shado", 31], ["batto", 31]]),
      t("Cris", "Treinadora", "0.4.0.1.5.1.7.2.11.7.0.0", [["batto", 32], ["shado", 32]]),
    ],
    leader: leader("Morgana", "0.4.0.3.5.3.7.0.11.11.1.7", [["batto", 34], ["shado", 35], ["shado", 36]]),
    prize: { orbi_ouro: 2, super_pocao: 3, doce_estelar: 1 },
  },
];

export function getGym(id: unknown): Gym | undefined {
  return GYMS.find((g) => g.id === id);
}

/** Treinadores na ordem do desafio: os comuns e por fim o líder. */
export function gymStages(gym: Gym): GymTrainer[] {
  return [...gym.trainers, gym.leader];
}
