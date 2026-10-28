// Arte das criaturas.
// Os PNGs ficam em client/public/sprites/ com o id da espécie (leafin.png, zappi.png...).
// Enquanto um arquivo não existir, aparece uma forma provisória na cor do tipo.
import { TYPE_COLOR, type TypeId } from "../../shared/battle/types";

export function creatureArt(speciesId: string, name: string, types: TypeId[], view: "front" | "back" = "front"): HTMLElement {
  const box = document.createElement("div");
  box.className = "creature-art";

  const placeholder = () => {
    box.replaceChildren();
    const blob = document.createElement("div");
    blob.className = `blob ${view}`;
    const c1 = TYPE_COLOR[types[0]];
    const c2 = TYPE_COLOR[types[1] ?? types[0]];
    blob.style.background = `radial-gradient(circle at 35% 30%, #ffffff55 0 18%, transparent 19%), linear-gradient(160deg, ${c1}, ${c2})`;
    if (view === "front") {
      const eyes = document.createElement("i");
      eyes.className = "eyes";
      eyes.append(document.createElement("b"), document.createElement("b"));
      blob.append(eyes);
    } else {
      const letter = document.createElement("span");
      letter.textContent = name.charAt(0);
      blob.append(letter);
    }
    box.append(blob);
  };

  const tryImage = (sources: string[]) => {
    const [src, ...rest] = sources;
    if (!src) return placeholder();
    const img = new Image();
    img.alt = name;
    img.onload = () => box.replaceChildren(img);
    img.onerror = () => tryImage(rest);
    img.src = src;
  };

  placeholder();
  // Sem arte de costas por enquanto: do seu lado a criatura aparece espelhada, olhando para o inimigo.
  if (view === "back") box.classList.add("mirrored");
  tryImage([`${import.meta.env.BASE_URL}sprites/${speciesId}.png`]);
  return box;
}
