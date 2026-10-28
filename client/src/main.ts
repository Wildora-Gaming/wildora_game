import Phaser from "phaser";
import "./battle/battle.css";
import { connect } from "./network";
import { WorldScene } from "./scenes/WorldScene";
import { BattleUI } from "./battle/BattleUI";
import { runCreator, type StartOptions } from "./creator/creator";
import { openBagPanel, openShop, openTeamPanel, showDialog } from "./panels/panels";
import { setProfile } from "./ui-state";
import { toast } from "./toast";
import type { DialogMessage, NoticeMessage, ProfileMessage, ShopMessage } from "../../shared/constants";

const loginRoot = document.getElementById("login")!;

async function start() {
  let opts: StartOptions = {};
  for (;;) {
    const profile = await runCreator(loginRoot, opts);
    try {
      const room = await connect({
        mode: profile.mode,
        name: profile.name,
        password: profile.password,
        starter: profile.starter,
        look: profile.mode === "register" ? profile.look : undefined,
      });

      // Registrar antes de qualquer espera: o servidor manda o perfil logo ao entrar.
      room.onMessage("profile", (msg: ProfileMessage) => {
        setProfile(msg);
        renderHud(msg);
      });
      room.onMessage("dialog", (msg: DialogMessage) => showDialog(msg.title, msg.text));
      room.onMessage("shop", (msg: ShopMessage) => openShop(room, msg));
      room.onMessage("notice", (msg: NoticeMessage) => toast(msg.text));
      new BattleUI(room);

      loginRoot.remove();
      document.getElementById("chat")!.style.display = "flex";
      document.getElementById("hud")!.style.display = "flex";
      document.getElementById("hud-team-btn")!.addEventListener("click", () => openTeamPanel(room));
      document.getElementById("hud-bag-btn")!.addEventListener("click", () => openBagPanel(room));

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
      const message = (err as Error)?.message ?? "";
      const fromServer = /senha|nome|conta|letras|caracteres/i.test(message);
      opts = {
        mode: profile.mode,
        error: fromServer ? message : "Não foi possível conectar ao servidor. Ele está rodando (npm run dev)?",
      };
    }
  }
}

function renderHud(p: ProfileMessage) {
  const lead = p.team[0];
  document.getElementById("hud-money")!.textContent = `${p.money} Sementes`;
  document.getElementById("hud-team")!.innerHTML = lead
    ? `<b>${lead.name}</b> Nv. ${lead.level} · Vida ${lead.hp}/${lead.maxHp}`
    : "";
}

start();
