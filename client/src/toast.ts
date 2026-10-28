// Aviso curto no topo da tela. durationMs = 0 deixa fixo.
let el: HTMLDivElement | null = null;
let timer: number | undefined;

export function toast(text: string, durationMs = 2500) {
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.append(el);
  }
  el.textContent = text;
  el.hidden = false;
  window.clearTimeout(timer);
  if (durationMs > 0) timer = window.setTimeout(() => el && (el.hidden = true), durationMs);
}
