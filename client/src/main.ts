import Phaser from "phaser";
import type { Room } from "colyseus.js";
import "./battle/battle.css";
import { connect, loadServerConfig, type ServerConfig } from "./network";
import { WorldScene } from "./scenes/WorldScene";
import { BattleUI } from "./battle/BattleUI";
import { runCreator, type StartOptions } from "./creator/creator";
import { makeSupabase, readEmailLink, runAuth } from "./auth/auth";
import { openBagPanel, openGymOffer, openShop, openTeamPanel, showDialog } from "./panels/panels";
import { setProfile, uiState } from "./ui-state";
import { toast } from "./toast";
import { markTouch, setupTouch } from "./touch/touch";
import { openPlayerMenu, setupTrade, showSocialRequest } from "./panels/social";
import type {
  DialogMessage,
  GymOfferMessage,
  NoticeMessage,
  ProfileMessage,
  ShopMessage,
  SocialRequestMessage,
} from "../../shared/constants";

const loginRoot = document.getElementById("login")!;
const errorText = (err: unknown) => (err as Error)?.message ?? String(err);
const OFFLINE = "Não foi possível conectar ao servidor do jogo. Ele está no ar?";

// ---------------- Modo local: nome de treinador + senha ----------------

async function startLocal(): Promise<Room> {
  let opts: StartOptions = {};
  for (;;) {
    const profile = await runCreator(loginRoot, opts);
    try {
      return await connect({
        mode: profile.mode,
        name: profile.name,
        password: profile.password,
        starter: profile.starter,
        look: profile.mode === "register" ? profile.look : undefined,
      });
    } catch (err) {
      const message = errorText(err);
      const fromServer = /senha|nome|conta|letras|caracteres/i.test(message);
      opts = { mode: profile.mode, error: fromServer ? message : OFFLINE };
    }
  }
}

// ---------------- Modo Supabase: e-mail, confirmação, esqueci a senha ----------------

async function startSupabase(cfg: Extract<ServerConfig, { auth: "supabase" }>): Promise<Room> {
  const link = readEmailLink(); // antes do Supabase limpar a URL
  const supa = makeSupabase(cfg.supabaseUrl, cfg.supabaseAnonKey);
  logout = async () => {
    await supa.auth.signOut().catch(() => {});
    window.location.reload();
  };

  let authError = link.error ?? undefined;
  let recovery = link.recovery;
  for (;;) {
    const session = await runAuth(loginRoot, supa, { error: authError, recovery, confirmed: link.confirmed });
    recovery = false;
    if (link.confirmed) toast("E-mail confirmado! Bem-vindo ao Wildora.", 3000);
    const token = session.access_token;
    try {
      return await connect({ token });
    } catch (err) {
      const message = errorText(err);
      if (/SEM_PERSONAGEM/.test(message)) return await createCharacter(token, session.user.email ?? "");
      if (/Sessão|Confirme/.test(message)) await supa.auth.signOut().catch(() => {});
      authError = /Sessão|Confirme|conectada/.test(message) ? message : OFFLINE;
    }
  }
}

/** Conta nova: monta o personagem e escolhe a criatura inicial. */
async function createCharacter(token: string, email: string): Promise<Room> {
  let opts: StartOptions = { characterOnly: { onBack: () => logout(), email } };
  for (;;) {
    const ch = await runCreator(loginRoot, opts);
    try {
      return await connect({ token, create: { name: ch.name, look: ch.look, starter: ch.starter } });
    } catch (err) {
      const message = errorText(err);
      opts = { ...opts, error: /nome|letras|conectada|Sessão/i.test(message) ? message : OFFLINE };
    }
  }
}

let logout: () => void | Promise<void> = () => window.location.reload();

// ---------------- Jogo ----------------

function startGame(room: Room) {
  // Registrar antes de qualquer espera: o servidor manda o perfil logo ao entrar.
  room.onMessage("profile", (msg: ProfileMessage) => {
    setProfile(msg);
    renderHud(msg);
  });
  // Avisos que chegam durante a batalha esperam ela terminar de animar
  const afterBattle = (fn: () => void) => {
    if (!uiState.inBattle) return fn();
    const timer = window.setInterval(() => {
      if (uiState.inBattle) return;
      window.clearInterval(timer);
      fn();
    }, 150);
  };
  room.onMessage("dialog", (msg: DialogMessage) => afterBattle(() => showDialog(msg.title, msg.text)));
  room.onMessage("shop", (msg: ShopMessage) => openShop(room, msg));
  room.onMessage("gym_offer", (msg: GymOfferMessage) => openGymOffer(room, msg));
  room.onMessage("notice", (msg: NoticeMessage) => toast(msg.text));
  new BattleUI(room);
  room.onMessage("social_request", (msg: SocialRequestMessage) => afterBattle(() => showSocialRequest(room, msg)));
  setupTrade(room);

  loginRoot.remove();
  document.getElementById("chat")!.style.display = "flex";
  document.getElementById("hud")!.style.display = "flex";
  document.getElementById("hud-team-btn")!.addEventListener("click", () => openTeamPanel(room));
  document.getElementById("hud-bag-btn")!.addEventListener("click", () => openBagPanel(room));
  document.getElementById("hud-logout")!.addEventListener("click", async () => {
    await room.leave().catch(() => {});
    await logout();
  });

  const world = new WorldScene(room);
  world.onPlayerSelect = (id, name) => openPlayerMenu(room, id, name);
  setupTouch({
    move: (dir) => world.touchMove(dir),
    interact: () => world.interact(),
    team: () => openTeamPanel(room),
    bag: () => openBagPanel(room),
    chat: () => world.openChat(),
  });

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#2f6b35",
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [world],
  });
  // acesso para depuração pelo console do navegador
  (window as unknown as { wildora: unknown }).wildora = { game, room };
}

function renderHud(p: ProfileMessage) {
  const lead = p.team[0];
  document.getElementById("hud-money")!.textContent = `${p.money} Sementes · ${p.badges.length}/8 insígnias`;
  document.getElementById("hud-team")!.innerHTML = lead
    ? `<b>${lead.name}</b> Nv. ${lead.level} · Vida ${lead.hp}/${lead.maxHp}`
    : "";
}

async function main() {
  markTouch();
  let cfg: ServerConfig;
  for (;;) {
    try {
      cfg = await loadServerConfig();
      break;
    } catch {
      loginRoot.innerHTML = `<div class="creator"><header class="welcome-hero"><h1>Wildora</h1><p>${OFFLINE} Tentando de novo...</p></header></div>`;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  const room = cfg.auth === "supabase" ? await startSupabase(cfg) : await startLocal();
  startGame(room);
}

main();
