import Phaser from "phaser";
import "./battle/battle.css";
import { connect } from "./network";
import { WorldScene } from "./scenes/WorldScene";
import { BattleUI } from "./battle/BattleUI";
import { runCreator, showCreatorError } from "./creator/creator";
import type { TeamMessage } from "../../shared/constants";

const loginRoot = document.getElementById("login")!;

async function start() {
  for (;;) {
    const profile = await runCreator(loginRoot);
    try {
      const room = await connect(profile.name, profile.starter, profile.look);

      // Registrar antes de qualquer espera: o servidor manda o time logo ao entrar.
      const hudTeam = document.getElementById("hud-team")!;
      room.onMessage("team", (msg: TeamMessage) => {
        const lead = msg.team[0];
        if (lead) hudTeam.innerHTML = `<b>${lead.name}</b> Nv. ${lead.level} · Vida ${lead.hp}/${lead.maxHp}`;
      });
      new BattleUI(room);

      loginRoot.remove();
      document.getElementById("chat")!.style.display = "flex";
      document.getElementById("hud")!.style.display = "flex";

      new Phaser.Game({
        type: Phaser.AUTO,
        parent: "game",
        backgroundColor: "#2f6b35",
        pixelArt: true,
        roundPixels: true,
        scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
        scene: [new WorldScene(room)],
      });
      return;
    } catch (err) {
      console.error(err);
      showCreatorError(loginRoot, "Não foi possível conectar ao servidor. Ele está rodando?");
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}

start();
