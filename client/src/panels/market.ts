// Mercado entre jogadores (Corretora Lívia, na Vila Broto) e troca com NPCs.
import type { Room } from "colyseus.js";
import { btn, closeModal, creatureRow, el, openModal } from "./panels";
import { itemIcon } from "../items-art";
import { creatureArt } from "../creature-art";
import { uiState } from "../ui-state";
import { getItem } from "../../../shared/items";
import { SPECIES } from "../../../shared/battle/data";
import type { CreatureView } from "../../../shared/battle/engine";

export interface ListingView {
  id: string;
  seller: string;
  price: number;
  creature?: CreatureView;
  itemId?: string;
  qty?: number;
  mine: boolean;
}
export interface MarketMessage {
  listings: ListingView[];
  mine: ListingView[];
  fee: number;
  maxPerSeller: number;
}

type Tab = "buy" | "sell" | "mine";
let tab: Tab = "buy";
let filter: "all" | "creature" | "item" = "all";

function priceInput(value: number, onChange: (v: number) => void) {
  const input = el("input", "price-input");
  input.type = "number";
  input.min = "1";
  input.max = "999999";
  input.step = "1";
  input.inputMode = "numeric";
  input.value = String(value);
  input.id = "market-price";
  input.addEventListener("input", () => onChange(Math.floor(Number(input.value) || 0)));
  input.addEventListener("keydown", (e) => e.stopPropagation());
  return input;
}

export function openMarket(room: Room, msg: MarketMessage) {
  const body = el("div", "modal-body market");
  let confirming: string | null = null;
  // formulário de venda
  let pick: { uid?: string; itemId?: string } | null = null;
  let qty = 1;
  let price = 500;

  const render = () => {
    const p = uiState.profile;
    if (!p) return;
    body.replaceChildren();
    body.append(el("div", "money-line", `Suas Sementes: ${p.money}`));
    const tabs = el("div", "tabs");
    const tabBtn = (t: Tab, label: string) => btn(label, () => ((tab = t), (confirming = null), render()), tab === t ? "tab active" : "tab");
    tabs.append(tabBtn("buy", `Comprar (${msg.listings.length})`), tabBtn("sell", "Anunciar"), tabBtn("mine", `Minhas ofertas (${msg.mine.length})`));
    body.append(tabs);

    if (tab === "buy") {
      const f = el("div", "tabs small-tabs");
      for (const [k, label] of [["all", "Tudo"], ["creature", "Criaturas"], ["item", "Itens"]] as const)
        f.append(btn(label, () => ((filter = k), render()), filter === k ? "tab active small" : "tab small"));
      body.append(f);
      const shown = msg.listings.filter((l) => filter === "all" || (filter === "creature" ? !!l.creature : !!l.itemId));
      if (!shown.length) body.append(el("p", "hint", "Nenhuma oferta por enquanto. Volte mais tarde ou anuncie a sua!"));
      const list = el("div", "c-list");
      for (const l of shown) {
        const label = confirming === l.id ? `Confirmar (${l.price})` : `Comprar (${l.price})`;
        const buy = btn(
          label,
          () => {
            if (confirming !== l.id) {
              confirming = l.id;
              return render();
            }
            confirming = null;
            room.send("market_buy", { id: l.id });
          },
          confirming === l.id ? "small" : "ghost small",
          p.money < l.price,
        );
        list.append(listingRow(l, [el("span", "seller", `de ${l.seller}`), buy]));
      }
      body.append(list);
    } else if (tab === "mine") {
      if (!msg.mine.length) body.append(el("p", "hint", `Você não tem ofertas abertas. Pode ter até ${msg.maxPerSeller}.`));
      const list = el("div", "c-list");
      for (const l of msg.mine) list.append(listingRow(l, [el("span", "seller", `${l.price} Sementes`), btn("Retirar", () => room.send("market_cancel", { id: l.id }), "ghost small")]));
      body.append(list);
      body.append(el("p", "hint", "Quando alguém comprar, as Sementes chegam na hora (ou quando você entrar de novo)."));
    } else {
      body.append(el("p", "hint", `Escolha o que anunciar e o preço. A vila fica com ${Math.round(msg.fee * 100)}% quando vender. Enquanto estiver anunciado, sai do seu time, caixa ou mochila.`));
      if (pick) {
        const form = el("div", "market-form");
        const c = pick.uid ? [...p.team, ...p.box].find((x) => x.uid === pick!.uid) : undefined;
        const have = pick.itemId ? (p.bag[pick.itemId] ?? 0) : 0;
        if (c) form.append(creatureRow(c, [], true));
        else if (pick.itemId) {
          const row = el("div", "i-row");
          const it = getItem(pick.itemId)!;
          const stepper = el("div", "stepper");
          stepper.append(
            btn("−", () => ((qty = Math.max(1, qty - 1)), render()), "ghost small"),
            el("span", "qty", String(qty)),
            btn("+", () => ((qty = Math.min(have, qty + 1)), render()), "ghost small"),
          );
          row.append(itemIcon(pick.itemId, 36), el("strong", "", `${it.name} (você tem ${have})`), stepper);
          form.append(row);
        }
        const line = el("div", "price-line");
        const net = Math.max(0, price - Math.floor(price * msg.fee));
        const netLabel = el("span", "hint", `Você recebe ${net}`);
        line.append(
          el("label", "", "Preço"),
          priceInput(price, (v) => {
            price = v;
            netLabel.textContent = `Você recebe ${Math.max(0, v - Math.floor(v * msg.fee))}`;
          }),
          netLabel,
        );
        const actions = el("div", "gym-actions");
        actions.append(
          btn("Voltar", () => ((pick = null), render()), "ghost"),
          btn("Anunciar", () => {
            if (!(price >= 1)) return;
            room.send("market_list", pick!.uid ? { uid: pick!.uid, price } : { itemId: pick!.itemId, qty, price });
            pick = null;
            tab = "mine";
          }),
        );
        form.append(line, actions);
        body.append(form);
        return;
      }
      body.append(el("h3", "shop-sub", "Criaturas"));
      const clist = el("div", "c-list");
      const all = [...p.team.map((c) => ({ c, where: "time" })), ...p.box.map((c) => ({ c, where: "caixa" }))];
      for (const { c, where } of all) {
        const lastInTeam = where === "time" && p.team.length <= 1;
        clist.append(creatureRow(c, [btn(lastInTeam ? "Única no time" : `Anunciar (${where})`, () => ((pick = { uid: c.uid }), render()), "ghost small", lastInTeam)], true));
      }
      body.append(clist);
      body.append(el("h3", "shop-sub", "Itens"));
      const ilist = el("div", "i-list");
      const bag = Object.entries(p.bag).filter(([, n]) => n > 0);
      if (!bag.length) ilist.append(el("p", "hint", "Mochila vazia."));
      for (const [id, n] of bag) {
        const it = getItem(id);
        if (!it) continue;
        const row = el("div", "i-row");
        const text = el("div", "i-text");
        text.append(el("strong", "", it.name), el("span", "", `Você tem ${n}.`));
        row.append(itemIcon(id, 36), text, btn("Anunciar", () => ((pick = { itemId: id }), (qty = 1), render()), "ghost small"));
        ilist.append(row);
      }
      body.append(ilist);
    }
  };

  const m = openModal("market", "Mercado da Vila Broto", body, { wide: true });
  m.setRender(render);
  render();
}

function listingRow(l: ListingView, actions: HTMLElement[]) {
  if (l.creature) return creatureRow(l.creature, actions, true);
  const row = el("div", "i-row");
  const it = getItem(l.itemId);
  const text = el("div", "i-text");
  text.append(el("strong", "", `${l.qty}× ${it?.name ?? l.itemId}`), el("span", "", it?.description ?? ""));
  const side = el("div", "i-buy");
  side.append(...actions);
  row.append(itemIcon(l.itemId ?? "", 36), text, side);
  return row;
}

// ---------------- Troca com NPC ----------------

export interface NpcSwapMessage {
  npcId: string;
  name: string;
  hello: string;
  want: string;
  give: string;
}

export function openNpcSwap(room: Room, msg: NpcSwapMessage) {
  const body = el("div", "modal-body swap");
  const want = SPECIES[msg.want];
  const give = SPECIES[msg.give];
  const render = () => {
    const p = uiState.profile;
    if (!p) return;
    body.replaceChildren();
    body.append(el("p", "social-text", msg.hello));
    const deal = el("div", "swap-deal");
    const side = (title: string, sp: typeof want) => {
      const box = el("div", "swap-side");
      box.append(el("span", "hint", title), creatureArt(sp.id, sp.name, sp.types, { box: 72 }), el("strong", "", sp.name));
      return box;
    };
    deal.append(side("Você entrega", want), el("span", "swap-arrow", "→"), side("Você recebe", give));
    body.append(deal, el("p", "hint", `A criatura nova vem no mesmo nível da que você entregar. Só dá para trocar uma vez.`));
    const mine = [...p.team, ...p.box].filter((c) => c.speciesId === msg.want);
    if (!mine.length) {
      body.append(el("p", "hint", `Você não tem um ${want.name}. Capture um e volte aqui!`));
      body.append(btn("Fechar", closeModal, "ghost"));
      return;
    }
    const list = el("div", "c-list");
    for (const c of mine) list.append(creatureRow(c, [btn("Trocar", () => room.send("npc_swap", { npcId: msg.npcId, uid: c.uid }), "small")], true));
    body.append(list);
  };
  const m = openModal("swap", `Troca com ${msg.name}`, body);
  m.setRender(render);
  render();
}
