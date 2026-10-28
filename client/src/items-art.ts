// Ícones dos itens em SVG pixelado (desenho original do Wildora).
const ORB_COLORS: Record<string, [string, string, string]> = {
  orbi: ["#2bb3a3", "#1b8075", "#f3ead2"],
  orbi_prata: ["#c9ced8", "#8f97a8", "#f3ead2"],
  orbi_ouro: ["#f2c53d", "#c4952f", "#fff6d6"],
};

function orbSvg(id: string) {
  const [top, shade, bottom] = ORB_COLORS[id] ?? ORB_COLORS.orbi;
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
<path fill="#2a2233" d="M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2z"/>
<path fill="${top}" d="M5 2h6v1h2v2h1v2H2V5h1V3h2z"/>
<path fill="${shade}" d="M11 3h2v2h1v2h-2V5h-1z"/>
<path fill="#fff" d="M4 3h2v1H5v1H4z"/>
<path fill="#2a2233" d="M2 7h12v2H2z"/>
<path fill="${bottom}" d="M2 9h12v1h-1v2h-2v1H5v-1H3v-2H2z"/>
<path fill="#e6c25a" d="M6 6h4v4H6z"/><path fill="#2a2233" d="M7 7h2v2H7z"/>
</svg>`;
}

function potionSvg(id: string) {
  const liquid = id === "super_pocao" ? "#b05cd6" : "#e5484d";
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
<path fill="#2a2233" d="M6 1h4v1h1v3h1v1h1v8h-1v1H4v-1H3V6h1V5h1V2h1z"/>
<path fill="#c9935a" d="M6 2h4v2H6z"/>
<path fill="#e8f4fb" d="M6 5h4v1h1v1h1v6H4V7h1V6h1z"/>
<path fill="${liquid}" d="M4 9h8v4H4z"/>
<path fill="#fff" d="M5 7h1v4H5z"/>
</svg>`;
}

export function itemIcon(id: string, size = 32): HTMLElement {
  const span = document.createElement("span");
  span.className = "item-icon";
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.innerHTML = id.startsWith("orbi") ? orbSvg(id) : potionSvg(id);
  return span;
}
