// Social: lista de amigos (online e onde estão) e ranking dos treinadores.
import type { Room } from "colyseus.js";
import { btn, el, isModalOpen, openModal } from "./panels";

interface Friend {
  id: string;
  name: string;
  online: boolean;
  area: string;
  busy: boolean;
}
interface RankRow {
  id: string;
  name: string;
  badges: number;
  caught: number;
  wins: number;
  legends: number;
}

let friends: Friend[] | null = null;
let ranking: { rows: RankRow[]; me?: string } | null = null;
let rerender: (() => void) | null = null;

/** Registra as respostas do servidor (uma vez, no início). */
export function setupFriends(room: Room) {
  room.onMessage("friends", (msg: { friends: Friend[] }) => {
    friends = msg.friends;
    if (isModalOpen("social")) rerender?.();
  });
  room.onMessage("ranking", (msg: { rows: RankRow[]; me?: string }) => {
    ranking = msg;
    if (isModalOpen("social")) rerender?.();
  });
}

type Tab = "friends" | "ranking";
type Cat = "badges" | "caught" | "wins" | "legends";
const CATS: [Cat, string][] = [
  ["badges", "Insígnias"],
  ["caught", "Espécies capturadas"],
  ["wins", "Vitórias"],
  ["legends", "Lendários"],
];
let tab: Tab = "friends";
let cat: Cat = "badges";

export function openSocial(room: Room, start: Tab = tab) {
  tab = start;
  const body = el("div", "modal-body social-panel");
  let removing: string | null = null;
  room.send("friends_open");
  room.send("ranking_open");

  const render = () => {
    body.replaceChildren();
    const tabs = el("div", "tabs");
    tabs.append(
      btn(`Amigos${friends ? ` (${friends.filter((f) => f.online).length}/${friends.length})` : ""}`, () => ((tab = "friends"), render()), tab === "friends" ? "tab active" : "tab"),
      btn("Ranking", () => ((tab = "ranking"), render()), tab === "ranking" ? "tab active" : "tab"),
    );
    body.append(tabs);

    if (tab === "friends") {
      if (!friends) {
        body.append(el("p", "hint", "Carregando..."));
        return;
      }
      if (!friends.length) body.append(el("p", "empty", "Você ainda não tem amigos na lista."));
      const list = el("div", "friend-list");
      for (const f of friends) {
        const row = el("div", `friend-row${f.online ? " on" : ""}`);
        const dot = el("span", "friend-dot");
        const text = el("div", "i-text");
        text.append(el("strong", "", f.name), el("span", "", f.online ? (f.busy ? `Em batalha · ${f.area}` : f.area) : "Offline"));
        const rm =
          removing === f.id
            ? btn("Confirmar", () => {
                removing = null;
                room.send("friend_remove", { id: f.id });
              }, "small")
            : btn("Remover", () => ((removing = f.id), render()), "ghost small");
        row.append(dot, text, rm);
        list.append(row);
      }
      body.append(list, el("p", "hint", "Para adicionar alguém, clique no treinador quando estiver perto e escolha “Adicionar amigo”."));
      return;
    }

    // ---------- ranking ----------
    const chips = el("div", "tabs small-tabs");
    for (const [k, label] of CATS) chips.append(btn(label, () => ((cat = k), render()), cat === k ? "tab active small" : "tab small"));
    body.append(chips);
    if (!ranking) {
      body.append(el("p", "hint", "Carregando..."));
      return;
    }
    const rows = [...ranking.rows].sort((a, b) => b[cat] - a[cat] || b.badges - a.badges || a.name.localeCompare(b.name, "pt-BR"));
    const table = el("div", "rank-list");
    const myPos = rows.findIndex((r) => r.id === ranking!.me);
    const shown = rows.slice(0, 20);
    shown.forEach((r, i) => table.append(rankRow(r, i, r.id === ranking!.me)));
    if (myPos >= 20) {
      table.append(el("div", "rank-gap", "…"));
      table.append(rankRow(rows[myPos], myPos, true));
    }
    body.append(table, el("p", "hint", `${rows.length} treinadores. Atualiza a cada meio minuto.`));

    function rankRow(r: RankRow, i: number, me: boolean) {
      const row = el("div", `rank-row${me ? " me" : ""}`);
      row.append(el("span", `rank-pos${i < 3 ? ` top${i + 1}` : ""}`, `${i + 1}º`), el("strong", "rank-name", r.name), el("span", "rank-val", String(r[cat])));
      return row;
    }
  };

  rerender = render;
  const m = openModal("social", "Social", body, { wide: true });
  m.setRender(render);
  render();
}
