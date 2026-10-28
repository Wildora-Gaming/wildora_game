// Arte das criaturas.
// Coloque os PNGs em client/public/sprites/ com o id da espécie:
//   leafin.png        (de frente, usado para inimigos e no login)
//   leafin_back.png   (de costas, usado para a sua criatura na batalha; opcional)
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
  const base = `${import.meta.env.BASE_URL}sprites/${speciesId}`;
  tryImage(view === "back" ? [`${base}_back.png`, `${base}.png`] : [`${base}.png`]);
  return box;
}
