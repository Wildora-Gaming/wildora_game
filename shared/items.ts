// Itens da mochila.

export type ItemKind = "orb" | "heal" | "level";

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  description: string;
  /** preço na loja em Sementes; null = não vende */
  price: number | null;
  /** orb: bônus de captura · heal: Vida recuperada · level: níveis ganhos */
  power: number;
}

export const ITEMS: Record<string, ItemDef> = {
  orbi: { id: "orbi", name: "Orbi", kind: "orb", description: "Captura criaturas selvagens.", price: 200, power: 1 },
  orbi_prata: {
    id: "orbi_prata",
    name: "Orbi Prata",
    kind: "orb",
    description: "Captura com bônus ×1,5.",
    price: 600,
    power: 1.5,
  },
  orbi_ouro: {
    id: "orbi_ouro",
    name: "Orbi Ouro",
    kind: "orb",
    description: "Captura com bônus ×2. Só em recompensas.",
    price: null,
    power: 2,
  },
  pocao: { id: "pocao", name: "Poção", kind: "heal", description: "Recupera 20 de Vida.", price: 150, power: 20 },
  super_pocao: {
    id: "super_pocao",
    name: "Super Poção",
    kind: "heal",
    description: "Recupera 60 de Vida.",
    price: 450,
    power: 60,
  },
  hiper_pocao: {
    id: "hiper_pocao",
    name: "Hiper Poção",
    kind: "heal",
    description: "Recupera 200 de Vida. Só com o Mercador viajante.",
    price: null,
    power: 200,
  },
  doce_estelar: {
    id: "doce_estelar",
    name: "Doce Estelar",
    kind: "level",
    description: "Sobe uma criatura 1 nível na hora (fora de batalha).",
    price: 1500,
    power: 1,
  },
};

export const SHOP_ITEMS = ["orbi", "orbi_prata", "pocao", "super_pocao", "doce_estelar"];

export const STARTING_BAG: Record<string, number> = { orbi: 5, pocao: 3 };
export const STARTING_MONEY = 500;

export function getItem(id: unknown): ItemDef | null {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null;
}

/** Chance de achar um Doce Estelar ao vencer uma criatura selvagem: 5%, ou 10% a partir do nível 20. */
export function candyChance(level: number) {
  return level >= 20 ? 0.1 : 0.05;
}

/** Sementes ganhas ao vencer uma criatura. */
export function moneyReward(level: number) {
  return 20 + level * 8;
}
