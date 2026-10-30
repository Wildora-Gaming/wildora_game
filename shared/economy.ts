// Preços de venda para a Loja, Mercado entre jogadores e Mercador viajante.
import { getItem } from "./items";
import { SPECIES } from "./battle/data";

/** Itens que a Loja compra pela metade do preço; os que não têm preço valem pelo tipo. */
const UNPRICED_VALUE: Record<string, number> = { orbi_ouro: 1200, hiper_pocao: 600 };

export function itemSellPrice(itemId: string): number {
  const it = getItem(itemId);
  if (!it) return 0;
  if (it.price !== null) return Math.floor(it.price / 2);
  return UNPRICED_VALUE[itemId] ?? 0;
}

/** Lendários não são vendidos para a Loja (só no Mercado, entre jogadores). */
export const isLegendary = (speciesId: string) => (SPECIES[speciesId]?.catchRate ?? 1) <= 0.03;

/** Quanto a Loja paga por uma criatura: cresce com o nível e com o quão rara/evoluída ela é. */
export function creatureSellPrice(c: { speciesId: string; level: number }): number {
  const sp = SPECIES[c.speciesId];
  if (!sp || isLegendary(c.speciesId)) return 0;
  return Math.round(((40 + sp.baseXp) * c.level) / 4 / 10) * 10;
}

// ---------------- Mercado entre jogadores ----------------

/** Ofertas abertas por jogador. */
export const MARKET_MAX_PER_SELLER = 8;
export const MARKET_MAX_PRICE = 999_999;
/** Taxa do Mercado (fica com a vila): 5% do preço. */
export const MARKET_FEE = 0.05;

// ---------------- Mercador viajante ----------------

/** O que o Mercador vende e por quanto (itens raros que a Loja não tem). */
export const MERCHANT_STOCK: { itemId: string; price: number }[] = [
  { itemId: "orbi_ouro", price: 2500 },
  { itemId: "hiper_pocao", price: 1200 },
  { itemId: "doce_estelar", price: 1100 },
  { itemId: "super_pocao", price: 380 },
];
/** De quanto em quanto tempo o Mercador muda de lugar. */
export const MERCHANT_STAY_MS = 30 * 60 * 1000;
