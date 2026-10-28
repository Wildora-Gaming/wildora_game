"""Prévia dos moldes: python3 tools/avatar/preview.py saida.png (mesma lógica de shared/avatar/compose.ts)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import parts

def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

FIXED = {"K": "#2a2233", "W": "#ffffff", "I": "#f4f1e8", "m": "#b8584a", "R": "#f3a5a0"}

def compose(look, d, frame):
    src_dir = "left" if d == "right" else d
    px = [list(r) for r in parts.BASE[(src_dir, frame)]]
    for (dd, r, c, k) in parts.TOPS[look["top"]]:
        if dd == src_dir and px[r][c] not in ".K":
            px[r][c] = k
    b = parts.BOTTOMS[look["bottom"]]
    for r in range(b["skinFrom"], 24):
        for c in range(16):
            if px[r][c] in "Pp":
                px[r][c] = "S"
    layers = []
    if b["overlay"]:
        layers.append(b["overlay"][src_dir])
    if src_dir != "up":
        layers.append(parts.EYES[look["eyes"]][src_dir])
    layers.append(parts.HAIR[look["hair"]][src_dir])
    hat = parts.HAT[look["hat"]]
    if hat:
        layers.append(hat[src_dir])
    for layer in layers:
        for r in range(24):
            for c in range(16):
                if layer[r][c] != ".":
                    px[r][c] = layer[r][c]
    if d == "right":
        px = [row[::-1] for row in px]
    return px

def render(look, pal, d, frame, scale=6):
    px = compose(look, d, frame)
    img = Image.new("RGBA", (16, 24), (0, 0, 0, 0))
    for r in range(24):
        for c in range(16):
            k = px[r][c]
            if k == ".":
                continue
            col = FIXED.get(k) or pal[k]
            img.putpixel((c, r), hx(col))
    return img.resize((16 * scale, 24 * scale), Image.NEAREST)

if __name__ == "__main__":
    looks = [
        ({"hair": "curto", "eyes": "redondo", "top": "jaqueta", "bottom": "calca", "hat": "bone"},
         {"S": "#f6c9a4", "s": "#d99e7c", "H": "#2b2b3a", "h": "#1a1a26", "E": "#3d2a1e", "T": "#d9433f", "t": "#a82f2c", "P": "#2e3f6e", "p": "#20305a", "B": "#3a3a46", "C": "#d9433f", "c": "#f4f1e8"}),
        ({"hair": "longo", "eyes": "cilios", "top": "camiseta", "bottom": "saia", "hat": "nenhum"},
         {"S": "#ffe0c8", "s": "#e8b496", "H": "#8a4b2a", "h": "#663319", "E": "#3a7bd5", "T": "#f2f0ea", "t": "#cfcabd", "P": "#d9433f", "p": "#a82f2c", "B": "#d9433f", "C": "#d9433f", "c": "#a82f2c"}),
        ({"hair": "rabo", "eyes": "redondo", "top": "regata", "bottom": "bermuda", "hat": "gorro"},
         {"S": "#c98c62", "s": "#a66e4a", "H": "#e8c14e", "h": "#c49a30", "E": "#3a9a5b", "T": "#3c9a5f", "t": "#2c7547", "P": "#5a4a3c", "p": "#45382c", "B": "#efe9dc", "C": "#7a5cc4", "c": "#5b4199"}),
        ({"hair": "cacheado", "eyes": "feliz", "top": "moletom", "bottom": "calca", "hat": "nenhum"},
         {"S": "#8a5a3c", "s": "#6b4229", "H": "#1d1a1f", "h": "#0e0c10", "E": "#3d2a1e", "T": "#e8b84a", "t": "#c4952f", "P": "#3a3a46", "p": "#28283a", "B": "#e86b4a", "C": "#2b2b3a", "c": "#1a1a26"}),
        ({"hair": "espetado", "eyes": "sereno", "top": "camiseta", "bottom": "calca", "hat": "nenhum"},
         {"S": "#f6c9a4", "s": "#d99e7c", "H": "#c2452f", "h": "#922f1f", "E": "#3d2a1e", "T": "#3a86c8", "t": "#2a66a0", "P": "#2b2b3a", "p": "#1a1a26", "B": "#d9433f", "C": "#d9433f", "c": "#a82f2c"}),
        ({"hair": "coque", "eyes": "cilios", "top": "jaqueta", "bottom": "calca", "hat": "nenhum"},
         {"S": "#ffe0c8", "s": "#e8b496", "H": "#9aa0b4", "h": "#6f7488", "E": "#7a5cc4", "T": "#e86b8a", "t": "#c04d6c", "P": "#3a5a8c", "p": "#2a4470", "B": "#2b2b3a", "C": "#d9433f", "c": "#a82f2c"}),
        ({"hair": "franja", "eyes": "redondo", "top": "camiseta", "bottom": "bermuda", "hat": "nenhum"},
         {"S": "#f6c9a4", "s": "#d99e7c", "H": "#5a3a22", "h": "#3e2614", "E": "#3d2a1e", "T": "#76b041", "t": "#578a2c", "P": "#c9a46a", "p": "#a5824c", "B": "#5a3a22", "C": "#d9433f", "c": "#a82f2c"}),
    ]
    out = sys.argv[1] if len(sys.argv) > 1 else "avatar_preview.png"
    combos = [("down", "stand"), ("down", "stepA"), ("down", "stepB"), ("left", "stand"), ("left", "stepA"), ("right", "stand"), ("up", "stand"), ("up", "stepA")]
    s = 5
    sheet = Image.new("RGBA", (len(combos) * 16 * s + 20, len(looks) * 24 * s + 20), (200, 228, 170, 255))
    for i, (look, pal) in enumerate(looks):
        for j, (d, f) in enumerate(combos):
            im = render(look, pal, d, f, s)
            sheet.alpha_composite(im, (10 + j * 16 * s, 10 + i * 24 * s))
    sheet.save(out)
    print(out)
