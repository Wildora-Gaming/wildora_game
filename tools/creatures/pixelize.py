"""
Gera a pixel art das criaturas a partir das referências da folha de arte.

As imagens em tools/creatures/reference/ são só referência de forma e cor: o jogo não usa
esses arquivos. Este script reduz cada uma para uma grade de pixels de verdade, com paleta
limitada, contorno escuro uniforme e sem pixels semitransparentes, e grava os pixels em
client/src/creatures/pixels.json. O jogo desenha esses pixels num canvas, em escala inteira.

Uso:
  python3 tools/creatures/pixelize.py               # gera o JSON
  python3 tools/creatures/pixelize.py previa.png    # gera o JSON e uma prévia ampliada

Ajustes por criatura ficam em TUNING (fator de redução e número de cores).
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REF = os.path.join(ROOT, "tools", "creatures", "reference")
OUT = os.path.join(ROOT, "client", "src", "creatures", "pixels.json")

# Quantos pixels da referência viram 1 pixel do jogo, e quantas cores (sem contar o contorno).
DEFAULT = {"factor": 2.1, "colors": 10}
TUNING = {
    # estágios finais são maiores: mais pixels, um pouco mais de cores
    "leafaurus": {"colors": 13},
    "flamberus": {"colors": 13},
    "aquarion": {"colors": 12},
    "zaptor": {"colors": 13},
    "rockolos": {"colors": 12},
    "shado": {"colors": 13},
    "batto": {"colors": 12},
    "zebri": {"colors": 9},
}
# Folha 2 (criaturas novas): desenhada maior, reduz mais
for _sid in ["terravin", "terravor", "aurabit", "aurabolt", "nimblo", "nimblor", "verdely", "verdelar", "pyraxis",
             "pyraxor", "zefril", "zefrion", "luminel", "luminella", "bellune", "bellunis", "drakosh", "drakoshar",
             "venturi", "venturion", "marinor", "marinox", "voltuga", "voltugon"]:
    TUNING[_sid] = {"factor": 2.6, "colors": 11}
# Folha 3: desenhos menores
for _sid in ["zephyl", "zephiro", "zephyrax", "mosseroo", "musgaroo", "musgalor", "bubblit", "bubbelle", "bubbelora",
             "spinora", "spinarra", "spinatrix", "muddle", "lamudo", "lamaroth", "petallia", "petalis", "petaliora",
             "ignicub", "ignurso", "ignurgo", "shadeleaf", "shademoss", "shadegrove", "frostitt", "frostorr",
             "frostarok", "tangleo", "tanglora", "tanglodon", "slitheria", "slitherion", "slitheragon", "ironclad",
             "ironback", "ironfort"]:
    TUNING[_sid] = {"factor": 1.9, "colors": 11}
# Lendários
for _sid in ["solvaris", "nocteon", "abyssion", "terralith"]:
    TUNING[_sid] = {"factor": 1.85, "colors": 14}

OUTLINE = (34, 28, 44)
CHARS = "abcdefghijklmnopqrstuvwxyz"


def nearest(pixels, palette):
    d = ((pixels[:, None, :].astype(int) - palette[None, :, :].astype(int)) ** 2).sum(axis=2)
    return d.argmin(axis=1)


def pixelize(path, factor, colors):
    im = np.array(Image.open(path).convert("RGBA"))
    h, w = im.shape[:2]
    alpha = im[:, :, 3] > 127
    rgb = im[:, :, :3]

    # 1) paleta da referência (corte mediano nos pixels opacos)
    opaque = rgb[alpha]
    strip = Image.fromarray(opaque.reshape(1, -1, 3).astype(np.uint8), "RGB")
    q = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    pal = np.array(q.getpalette()[: colors * 3], dtype=np.uint8).reshape(-1, 3)
    idx_full = np.full((h, w), -1, dtype=int)
    idx_full[alpha] = nearest(opaque, pal)

    # 2) reduz para a grade: cada célula fica com a cor mais frequente (moda)
    tw, th = max(1, round(w / factor)), max(1, round(h / factor))
    grid = np.full((th, tw), -1, dtype=int)
    for ty in range(th):
        y0, y1 = int(ty * h / th), max(int(ty * h / th) + 1, int((ty + 1) * h / th))
        for tx in range(tw):
            x0, x1 = int(tx * w / tw), max(int(tx * w / tw) + 1, int((tx + 1) * w / tw))
            cell = idx_full[y0:y1, x0:x1].ravel()
            solid = cell[cell >= 0]
            if solid.size < cell.size * 0.5:
                continue
            counts = np.bincount(solid, minlength=len(pal))
            # detalhes escuros (olhos, bocas) somem na moda: dá peso extra a eles
            lum = pal.astype(int) @ np.array([299, 587, 114]) / 1000
            weights = counts * np.where(lum < 70, 1.8, 1.0)
            grid[ty, tx] = int(weights.argmax())

    # 3) limpa pixels soltos (sem nenhum vizinho da mesma cor), menos os mais escuros/claros
    lum = pal.astype(int) @ np.array([299, 587, 114]) / 1000
    for _ in range(2):
        out = grid.copy()
        for y in range(th):
            for x in range(tw):
                c = grid[y, x]
                if c < 0 or lum[c] < 70 or lum[c] > 225:
                    continue
                neigh = [grid[yy, xx] for yy in range(max(0, y - 1), min(th, y + 2))
                         for xx in range(max(0, x - 1), min(tw, x + 2)) if (yy, xx) != (y, x)]
                solid = [n for n in neigh if n >= 0]
                if solid and solid.count(c) < 2:
                    out[y, x] = max(set(solid), key=solid.count)
        grid = out

    # 4) contorno: pixel opaco que encosta no transparente vira contorno escuro
    border = np.zeros_like(grid, dtype=bool)
    for y in range(th):
        for x in range(tw):
            if grid[y, x] < 0:
                continue
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if not (0 <= yy < th and 0 <= xx < tw) or grid[yy, xx] < 0:
                    border[y, x] = True
                    break

    # 5) monta a paleta final (só cores usadas) + contorno
    used = sorted(set(grid[(grid >= 0) & ~border].ravel().tolist()))
    final_pal = ["#%02x%02x%02x" % OUTLINE] + ["#%02x%02x%02x" % tuple(pal[i]) for i in used]
    remap = {old: CHARS[i + 1] for i, old in enumerate(used)}
    rows = []
    for y in range(th):
        row = ""
        for x in range(tw):
            c = grid[y, x]
            row += "." if c < 0 else CHARS[0] if border[y, x] else remap.get(c, CHARS[0])
        rows.append(row)

    # recorta linhas/colunas vazias
    while rows and set(rows[0]) == {"."}:
        rows.pop(0)
    while rows and set(rows[-1]) == {"."}:
        rows.pop()
    left = min(len(r) - len(r.lstrip(".")) for r in rows)
    right = min(len(r) - len(r.rstrip(".")) for r in rows)
    rows = [r[left: len(r) - right] for r in rows]
    return {"w": len(rows[0]), "h": len(rows), "palette": final_pal, "rows": rows}


def render(sprite, scale):
    img = Image.new("RGBA", (sprite["w"] * scale, sprite["h"] * scale), (0, 0, 0, 0))
    pal = [tuple(int(c[i: i + 2], 16) for i in (1, 3, 5)) + (255,) for c in sprite["palette"]]
    px = img.load()
    for y, row in enumerate(sprite["rows"]):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            col = pal[CHARS.index(ch)]
            for yy in range(scale):
                for xx in range(scale):
                    px[x * scale + xx, y * scale + yy] = col
    return img


def main():
    data = {}
    for path in sorted(glob.glob(os.path.join(REF, "*.png"))):
        sid = os.path.splitext(os.path.basename(path))[0]
        opts = {**DEFAULT, **TUNING.get(sid, {})}
        data[sid] = pixelize(path, opts["factor"], opts["colors"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"{len(data)} criaturas -> {OUT}")

    if len(sys.argv) > 1:
        scale, cols, cell = 4, 7, 220
        ids = list(data)
        sheet = Image.new("RGBA", (cols * cell, ((len(ids) + cols - 1) // cols) * cell), (232, 240, 214, 255))
        for i, sid in enumerate(ids):
            im = render(data[sid], scale)
            sheet.alpha_composite(im, ((i % cols) * cell + (cell - im.width) // 2, (i // cols) * cell + (cell - im.height) // 2))
        sheet.save(sys.argv[1])
        print("prévia:", sys.argv[1])


if __name__ == "__main__":
    main()
