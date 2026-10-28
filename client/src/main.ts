import Phaser from "phaser";
import "./battle/battle.css";
import { connect } from "./network";
import { WorldScene } from "./scenes/WorldScene";
import { BattleUI } from "./battle/BattleUI";
import { creatureArt } from "./creature-art";
import { SPECIES, STARTERS, type SpeciesId } from "../../shared/battle/data";
import { TYPE_LABEL, type TypeId } from "../../shared/battle/types";
import type { TeamMessage } from "../../shared/constants";

const form = document.getElementById("login-form") as HTMLFormElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const loginError = document.getElementById("login-error") as HTMLDivElement;
const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
const startersBox = document.getElementById("starters") as HTMLDivElement;

// Escolha da criatura inicial
let starter: SpeciesId = STARTERS[0];
for (const id of STARTERS) {
  const s = SPECIES[id];
  const types = s.types as TypeId[];
  const b = document.createElement("button");
  b.type = "button";
  b.className = "starter";
  b.setAttribute("aria-pressed", String(id === starter));
  const label = document.createElement("span");
  label.textContent = s.name;
  const kind = document.createElement("small");
  kind.textContent = types.map((t) => TYPE_LABEL[t]).join("/");
  b.append(creatureArt(id, s.name, types), label, kind);
  b.addEventListener("click", () => {
    starter = id;
    for (const other of startersBox.querySelectorAll(".starter")) other.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-pressed", "true");
  });
  startersBox.append(b);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  loginError.textContent = "";

  try {
    const room = await connect(nameInput.value, starter);

    // Registrar antes de qualquer espera: o servidor manda o time logo ao entrar.
    const hudTeam = document.getElementById("hud-team")!;
    room.onMessage("team", (msg: TeamMessage) => {
      const lead = msg.team[0];
      if (lead) hudTeam.innerHTML = `<b>${lead.name}</b> Nv. ${lead.level} · Vida ${lead.hp}/${lead.maxHp}`;
    });
    new BattleUI(room);

    document.getElementById("login")!.remove();
    document.getElementById("chat")!.style.display = "flex";
    document.getElementById("hud")!.style.display = "flex";

    new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      backgroundColor: "#14161c",
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      scene: [new WorldScene(room)],
    });
  } catch (err) {
    console.error(err);
    loginError.textContent = "Não foi possível conectar ao servidor. Ele está rodando?";
    submit.disabled = false;
  }
});
