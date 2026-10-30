// Painéis do mundo: Time/Caixa, Mochila, Loja e diálogos.
// Só mostram dados e enviam pedidos; o servidor valida e responde com um perfil novo.
import type { Room } from "colyseus.js";
import "./panels.css";
import { creatureArt } from "../creature-art";
import { itemIcon } from "../items-art";
import { onProfile, uiState } from "../ui-state";
import { getItem } from "../../../shared/items";
import { TYPE_COLOR, TYPE_LABEL } from "../../../shared/battle/types";
import { STATUS_LABEL } from "../../../shared/battle/data";
import { TEAM_MAX, type GymOfferMessage, type ProfileMessage, type ShopMessage } from "../../../shared/constants";
import { GYMS } from "../../../shared/gyms";
import { creatureSellPrice, itemSellPrice } from "../../../shared/economy";
import type { CreatureView } from "../../../shared/battle/engine";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function btn(label: string, onClick: () => void, kind = "", disabled = false) {
  const b = el("button", `pbtn ${kind}`, label);
  b.type = "button";
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

// ---------------- Modal ----------------

let current: { root: HTMLElement; kind: string; render?: () => void; onClose?: () => void } | null = null;

export function closeModal() {
  if (!current) return;
  const c = current;
  current = null;
  c.root.remove();
  uiState.modalOpen = false;
  c.onClose?.();
}

export function openModal(kind: string, title: string, body: HTMLElement, opts: { wide?: boolean; onClose?: () => void } = {}) {
  closeModal();
  const root = el("div", "modal-backdrop");
  const panel = el("section", `modal${opts.wide ? " wide" : ""}`);
  const head = el("header", "modal-head");
  head.append(el("h2", "", title), btn("✕", closeModal, "close"));
  panel.append(head, body);
  root.append(panel);
  root.addEventListener("mousedown", (e) => {
    if (e.target === root) closeModal();
  });
  document.body.append(root);
  uiState.modalOpen = true;
  current = { root, kind, onClose: opts.onClose };
  (document.activeElement as HTMLElement | null)?.blur();
  return { body, setRender: (fn: () => void) => current && (current.render = fn) };
}

window.addEventListener("keydown", (e) => {
  if (!current) return;
  if (e.key === "Escape" || (current.kind === "dialog" && (e.key === "Enter" || e.key === " " || e.key === "e" || e.key === "E"))) {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  }
}, true);

onProfile(() => current?.render?.());

export function isModalOpen(kind?: string) {
  return !!current && (!kind || current.kind === kind);
}

// ---------------- Diálogo ----------------

export function showDialog(title: string, text: string) {
  const body = el("div", "modal-body dialog");
  const ok = el("button", "pbtn", "OK") as HTMLButtonElement;
  ok.type = "button";
  ok.style.justifySelf = "end";
  ok.addEventListener("click", () => closeModal());
  body.append(el("p", "", text));
  if (!document.documentElement.classList.contains("touch")) body.append(el("small", "hint", "Enter, Espaço ou E para fechar"));
  body.append(ok);
  openModal("dialog", title, body);
}

// ---------------- Criatura ----------------

export function hpBar(hp: number, max: number) {
  const track = el("div", "p-hp");
  const fill = el("div", "p-hp-fill");
  const pct = max > 0 ? (hp / max) * 100 : 0;
  fill.style.width = `${pct}%`;
  if (pct <= 20) fill.classList.add("low");
  else if (pct <= 50) fill.classList.add("mid");
  track.append(fill);
  return track;
}

export function creatureRow(c: CreatureView, actions: HTMLElement[] = [], compact = false) {
  const row = el("div", `c-row${c.hp <= 0 ? " fainted" : ""}`);
  const art = creatureArt(c.speciesId, c.name, c.types, { box: 64 });
  art.classList.add("c-art");
  const info = el("div", "c-info");
  const top = el("div", "c-top");
  top.append(el("strong", "", c.name), el("span", "c-lvl", `Nv. ${c.level}`));
  for (const t of c.types) {
    const tag = el("span", "c-type", TYPE_LABEL[t]);
    tag.style.background = TYPE_COLOR[t];
    top.append(tag);
  }
  if (c.status) top.append(el("span", "c-status", STATUS_LABEL[c.status]));
  info.append(top);
  const hpLine = el("div", "c-hpline");
  hpLine.append(el("span", "c-hplabel", "HP"), hpBar(c.hp, c.maxHp), el("span", "c-hpnum", `${c.hp}/${c.maxHp}`));
  info.append(hpLine);
  if (!compact) {
    const xp = el("div", "c-xp");
    const xpFill = el("div", "c-xp-fill");
    xpFill.style.width = `${Math.round(c.xpProgress * 100)}%`;
    xp.append(xpFill);
    info.append(xp);
    const moves = el("div", "c-moves");
    for (const m of c.moves) {
      const chip = el("span", "c-move", m.name);
      chip.style.borderColor = TYPE_COLOR[m.type];
      moves.append(chip);
    }
    info.append(moves);
  }
  row.append(art, info);
  if (actions.length) {
    const box = el("div", "c-actions");
    box.append(...actions);
    row.append(box);
  }
  return row;
}

// ---------------- Time e caixa ----------------

export function openTeamPanel(room: Room) {
  const body = el("div", "modal-body");
  let tab: "team" | "box" = "team";
  const render = () => {
    const p = uiState.profile;
    if (!p) return;
    body.replaceChildren();
    const tabs = el("div", "tabs");
    tabs.append(
      btn(`Time (${p.team.length}/${TEAM_MAX})`, () => ((tab = "team"), render()), tab === "team" ? "tab active" : "tab"),
      btn(`Caixa (${p.box.length})`, () => ((tab = "box"), render()), tab === "box" ? "tab active" : "tab"),
    );
    body.append(tabs);
    const list = el("div", "c-list");
    if (tab === "team") {
      p.team.forEach((c, i) => {
        const actions = [
          btn(i === 0 ? "Líder" : "Tornar líder", () => room.send("team_order", { from: i, to: 0 }), "", i === 0),
          btn("Guardar", () => room.send("box_deposit", { index: i }), "ghost", p.team.length <= 1),
        ];
        list.append(creatureRow(c, actions));
      });
      body.append(list, el("p", "hint", "A líder entra primeiro nas batalhas. Criaturas capturadas com o time cheio vão para a caixa."));
    } else {
      if (!p.box.length) list.append(el("p", "empty", "A caixa está vazia."));
      p.box.forEach((c, i) => {
        list.append(creatureRow(c, [btn("Levar ao time", () => room.send("box_withdraw", { index: i }), "", p.team.length >= TEAM_MAX)]));
      });
      body.append(list);
    }
    const foot = el("div", "dex-line", `Criaturas vistas: ${p.dex.seen} · capturadas: ${p.dex.caught}`);
    body.append(foot, badgeRow(p.badges));
  };
  const m = openModal("team", "Seu time", body, { wide: true });
  m.setRender(render);
  render();
}

// ---------------- Mochila ----------------

export function openBagPanel(room: Room) {
  const body = el("div", "modal-body");
  let choosing: string | null = null;
  const render = () => {
    const p = uiState.profile;
    if (!p) return;
    body.replaceChildren();
    body.append(el("div", "money-line", `Sementes: ${p.money}`));
    const entries = Object.entries(p.bag).filter(([, n]) => n > 0);
    if (!entries.length) body.append(el("p", "empty", "A mochila está vazia. A Loja fica na casa de telhado azul."));
    const list = el("div", "i-list");
    for (const [id, n] of entries) {
      const item = getItem(id);
      if (!item) continue;
      const row = el("div", "i-row");
      const text = el("div", "i-text");
      text.append(el("strong", "", `${item.name} ×${n}`), el("span", "", item.description));
      row.append(itemIcon(id, 36), text);
      if (item.kind === "heal" || item.kind === "level") row.append(btn(choosing === id ? "Cancelar" : "Usar", () => ((choosing = choosing === id ? null : id), render())));
      else row.append(el("span", "i-note", "Usar em batalha"));
      list.append(row);
    }
    body.append(list);
    if (choosing) {
      body.append(el("p", "hint", `Em quem usar ${getItem(choosing)?.name}?`));
      const targets = el("div", "c-list");
      const levelItem = getItem(choosing)?.kind === "level";
      p.team.forEach((c, i) => {
        const full = levelItem ? c.level >= 60 || c.hp <= 0 : c.hp >= c.maxHp || c.hp <= 0;
        targets.append(
          creatureRow(c, [btn("Usar aqui", () => { room.send("use_item", { itemId: choosing, target: i }); choosing = null; }, "", full)], true),
        );
      });
      body.append(targets);
    }
  };
  const m = openModal("bag", "Mochila", body, { wide: true });
  m.setRender(render);
  render();
}

// ---------------- Loja ----------------

export function openShop(room: Room, msg: ShopMessage) {
  const body = el("div", "modal-body");
  const qty: Record<string, number> = {};
  const sellQty: Record<string, number> = {};
  let tab: "buy" | "sell" = "buy";
  let confirming: string | null = null; // uid da criatura esperando confirmação de venda
  const stepper = (store: Record<string, number>, id: string, max: number) => {
    const n = Math.min(store[id] ?? 1, Math.max(1, max));
    const box = el("div", "stepper");
    box.append(
      btn("−", () => ((store[id] = Math.max(1, n - 1)), render()), "ghost small"),
      el("span", "qty", String(n)),
      btn("+", () => ((store[id] = Math.min(max, n + 1)), render()), "ghost small"),
    );
    return { box, n };
  };
  const render = () => {
    const p: ProfileMessage | null = uiState.profile;
    const money = p?.money ?? msg.money;
    body.replaceChildren();
    body.append(el("div", "money-line", `Suas Sementes: ${money}`));
    if (msg.shop === "loja") {
      const tabs = el("div", "tabs");
      tabs.append(
        btn("Comprar", () => ((tab = "buy"), render()), tab === "buy" ? "tab active" : "tab"),
        btn("Vender", () => ((tab = "sell"), render()), tab === "sell" ? "tab active" : "tab"),
      );
      body.append(tabs);
    }
    const list = el("div", "i-list");
    if (tab === "buy") {
      for (const it of msg.items) {
        const row = el("div", "i-row");
        const text = el("div", "i-text");
        const have = p?.bag[it.id] ?? 0;
        text.append(el("strong", "", `${it.name} · ${it.price}`), el("span", "", `${it.description} Você tem ${have}.`));
        const { box, n } = stepper(qty, it.id, 99);
        const cost = it.price * n;
        const buy = el("div", "i-buy");
        buy.append(box, btn(`Comprar (${cost})`, () => room.send("buy", { itemId: it.id, qty: n, shop: msg.shop }), "", cost > money));
        row.append(itemIcon(it.id, 36), text, buy);
        list.append(row);
      }
      body.append(list);
      return;
    }
    // ---------- vender ----------
    body.append(el("h3", "shop-sub", "Itens da mochila (metade do preço)"));
    const bag = Object.entries(p?.bag ?? {}).filter(([id, n]) => n > 0 && itemSellPrice(id) > 0);
    if (!bag.length) list.append(el("p", "hint", "Nada para vender na mochila."));
    for (const [id, have] of bag) {
      const it = getItem(id)!;
      const price = itemSellPrice(id);
      const row = el("div", "i-row");
      const text = el("div", "i-text");
      text.append(el("strong", "", `${it.name} · ${price} cada`), el("span", "", `Você tem ${have}.`));
      const { box, n } = stepper(sellQty, id, have);
      const sell = el("div", "i-buy");
      sell.append(box, btn(`Vender (${price * n})`, () => room.send("sell_item", { itemId: id, qty: n }), "ghost"));
      row.append(itemIcon(id, 36), text, sell);
      list.append(row);
    }
    body.append(list);
    body.append(el("h3", "shop-sub", "Criaturas da caixa"));
    const boxed = p?.box ?? [];
    if (!boxed.length) body.append(el("p", "hint", "Sua caixa está vazia. Só criaturas da caixa podem ser vendidas (guarde pelo Time → Caixa)."));
    const clist = el("div", "c-list");
    for (const c of boxed) {
      const price = creatureSellPrice(c);
      const action =
        price <= 0
          ? btn("Lendário: só no Mercado", () => {}, "ghost small", true)
          : confirming === c.uid
            ? btn(`Confirmar venda (${price})`, () => ((confirming = null), room.send("sell_creature", { uid: c.uid })), "small")
            : btn(`Vender (${price})`, () => ((confirming = c.uid), render()), "ghost small");
      clist.append(creatureRow(c, [action], true));
    }
    body.append(clist);
  };
  const m = openModal("shop", msg.title, body, { wide: true });
  m.setRender(render);
  render();
}

// ---------------- Insígnias ----------------

export function badgeRow(owned: string[]) {
  const row = el("div", "badges");
  row.append(el("strong", "", `Insígnias ${owned.length}/${GYMS.length}`));
  const list = el("div", "badge-list");
  for (const g of GYMS) {
    const b = el("span", `badge${owned.includes(g.id) ? " got" : ""}`);
    b.style.setProperty("--type", TYPE_COLOR[g.type]);
    b.title = owned.includes(g.id) ? g.badge : `${g.badge} (${g.name})`;
    list.append(b);
  }
  row.append(list);
  return row;
}

// ---------------- Ginásio ----------------

export function openGymOffer(room: Room, msg: GymOfferMessage) {
  const body = el("div", "modal-body gym-offer");
  const lead = el("p", "gym-quote", `“${msg.quote}” — ${msg.leader}, líder`);
  const facts = el("ul", "gym-facts");
  for (const line of [
    `Tipo: ${msg.type}`,
    `Desafio: ${msg.trainers} treinadores e o líder, em sequência, sem curar no meio`,
    `Nível do ginásio: ${msg.level}`,
    msg.hasBadge ? `Você já tem a ${msg.badge}: a revanche vale Sementes e XP` : `Prêmio: ${msg.badge}`,
  ])
    facts.append(el("li", "", line));
  const team = uiState.profile?.team ?? [];
  const tip = el("p", "hint", team.length ? `Seu time: ${team.map((c) => `${c.name} Nv.${c.level}`).join(", ")}.` : "");
  const actions = el("div", "gym-actions");
  actions.append(
    btn("Agora não", closeModal, "ghost"),
    btn(
      "Desafiar",
      () => {
        closeModal();
        room.send("gym_challenge", { gymId: msg.gymId });
      },
    ),
  );
  body.append(lead, facts, tip, actions);
  openModal("gym", msg.name, body);
}
