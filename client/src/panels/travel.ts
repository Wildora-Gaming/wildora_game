// Centro/Posto de Cura: time recuperado e viagem rápida para os lugares já visitados.
import type { Room } from "colyseus.js";
import { btn, closeModal, el, openModal } from "./panels";
import { uiState } from "../ui-state";

export interface HealMenuMessage {
  here: string;
  title: string;
  points: { id: string; name: string; cost: number; visited: boolean }[];
}

export function openHealMenu(room: Room, msg: HealMenuMessage) {
  const body = el("div", "modal-body travel");
  const render = () => {
    const money = uiState.profile?.money ?? 0;
    body.replaceChildren();
    body.append(el("p", "social-text", "Seu time foi totalmente recuperado. Volte sempre que precisar!"));
    body.append(el("h3", "shop-sub", "Viagem rápida"));
    body.append(el("p", "hint", `Vá para qualquer Centro ou Posto de Cura que você já visitou. Você tem ${money} Sementes.`));
    const list = el("div", "travel-list");
    const sorted = [...msg.points].sort((a, b) => Number(b.visited) - Number(a.visited) || a.cost - b.cost);
    for (const p of sorted) {
      const row = el("div", `travel-row${p.visited ? "" : " locked"}`);
      const text = el("div", "i-text");
      text.append(el("strong", "", p.name), el("span", "", p.visited ? `${p.cost} Sementes` : "Ainda não visitado: vá até lá andando uma vez"));
      row.append(
        text,
        btn(
          p.visited ? `Viajar (${p.cost})` : "Bloqueado",
          () => {
            room.send("travel", { to: p.id });
            closeModal();
          },
          "small",
          !p.visited || money < p.cost,
        ),
      );
      list.append(row);
    }
    body.append(list, btn("Ficar aqui", closeModal, "ghost"));
  };
  const m = openModal("heal", msg.title, body);
  m.setRender(render);
  render();
}
