// Botão "Som" no topo: liga/desliga e ajusta música e efeitos (fica salvo no navegador).
import { sound } from "./audio";

export function setupSoundPanel() {
  const button = document.getElementById("hud-sound") as HTMLButtonElement | null;
  if (!button) return;

  const panel = document.createElement("div");
  panel.id = "sound-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <label class="snd-row"><span>Música</span><input type="range" min="0" max="100" step="5" data-k="music" /></label>
    <label class="snd-row"><span>Efeitos</span><input type="range" min="0" max="100" step="5" data-k="sfx" /></label>
    <label class="snd-check"><input type="checkbox" data-k="muted" /> Sem som</label>`;
  document.body.append(panel);

  const music = panel.querySelector<HTMLInputElement>('[data-k="music"]')!;
  const sfx = panel.querySelector<HTMLInputElement>('[data-k="sfx"]')!;
  const muted = panel.querySelector<HTMLInputElement>('[data-k="muted"]')!;

  const sync = () => {
    const s = sound.settings;
    music.value = String(Math.round(s.music * 100));
    sfx.value = String(Math.round(s.sfx * 100));
    muted.checked = s.muted;
    button.textContent = s.muted ? "Som: desligado" : "Som";
    button.setAttribute("aria-pressed", String(!s.muted));
  };
  sync();

  music.addEventListener("input", () => sound.setSettings({ music: Number(music.value) / 100, muted: false }));
  sfx.addEventListener("input", () => sound.setSettings({ sfx: Number(sfx.value) / 100, muted: false }));
  sfx.addEventListener("change", () => sound.sfx("hit"));
  muted.addEventListener("change", () => sound.setSettings({ muted: muted.checked }));
  for (const el of [music, sfx, muted]) el.addEventListener("change", sync);

  const place = () => {
    const r = button.getBoundingClientRect();
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - 228, r.left))}px`;
  };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) place();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && e.target !== button) panel.hidden = true;
  });
  window.addEventListener("resize", () => !panel.hidden && place());
}
