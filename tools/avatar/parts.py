"""
Moldes do personagem em pixel art (16x24 por quadro).

Este arquivo é a fonte da verdade: `python3 tools/avatar/parts.py` gera
`shared/avatar/parts.json` (lido pelo jogo) e uma prévia em PNG.

Legenda dos pixels:
  .  transparente (a camada não desenha)
  K  contorno            W  branco (brilho do olho)     I  camisa de dentro (jaqueta)
  S  pele                s  pele sombra                 m  boca        R  bochecha
  H  cabelo              h  cabelo sombra
  E  íris (cor do olho)
  T  roupa de cima       t  roupa de cima sombra
  P  roupa de baixo      p  roupa de baixo sombra       B  sapato
  C  chapéu              c  chapéu sombra/aba
"""
import json, os, sys

W, H = 16, 24
DIRS = ["down", "up", "left"]


def grid(rows, start=0):
    """Completa até 24 linhas; `start` é a linha onde o molde começa."""
    out = ["." * W] * start + list(rows)
    out += ["." * W] * (H - len(out))
    for i, r in enumerate(out):
        assert len(r) == W, f"linha {i} com {len(r)} colunas: {r!r}"
    assert len(out) == H, len(out)
    return out


# ---------------- Corpo ----------------
HEAD_FRONT = [
    "................",
    "....KKKKKKKK....",
    "...KSSSSSSSSK...",
    "..KSSSSSSSSSSK..",
    "..KSSSSSSSSSSK..",
    "..KSSSSSSSSSSK..",
    "..KSSSSSSSSSSK..",
    "..KSSSSSSSSSSK..",
    "..KSSSSSSSSSSK..",
    "..KsSSSSSSSSsK..",
    "...KsSSSSSSsK...",
    "....KKKSSKKK....",
]
TORSO_FRONT = [
    "...KTTTSSTTTK...",
    "..KTTTTTTTTTTK..",
    "..KTKTTTTTTKTK..",
    "..KTKTTTTTTKTK..",
    "..KSKTTTTTTKSK..",
    "..KKKttttttKKK..",
]
LEGS_FRONT = {
    "stand": [
        "....KPPPPPPK....",
        "....KPPKKPPK....",
        "....KPPKKPPK....",
        "....KPPKKPPK....",
        "....KBBKKBBK....",
        ".....KK..KK.....",
    ],
    "stepA": [
        "....KPPPPPPK....",
        "....KPPKKPPK....",
        "....KPPKKPPK....",
        "....KBBKKPPK....",
        ".....KK.KBBK....",
        ".........KK.....",
    ],
}
LEGS_FRONT["stepB"] = [r[::-1] for r in LEGS_FRONT["stepA"]]

HEAD_SIDE = [
    "................",
    ".....KKKKKKK....",
    "....KSSSSSSSK...",
    "...KSSSSSSSSSK..",
    "...KSSSSSSSSSK..",
    "...KSSSSSSSSSK..",
    "..KSSSSSSSSSSK..",
    "..KSSSSSSSSSSK..",
    "...KSSSSSSSSSK..",
    "...KsSSSSSSSsK..",
    "....KsSSSSSsK...",
    ".....KKSSKKK....",
]
TORSO_SIDE = [
    ".....KTTTTTK....",
    "....KTTTTTTTK...",
    "....KTTKTTTTK...",
    "....KTTKTTTTK...",
    "....KSSKTTTTK...",
    "....KKKKttttK...",
]
LEGS_SIDE = {
    "stand": [
        ".....KPPPPPK....",
        ".....KPPPPPK....",
        ".....KPPPPPK....",
        ".....KPPPPPK....",
        "....KBBBBBBK....",
        "....KKKKKKKK....",
    ],
    "stepA": [
        ".....KPPPPPK....",
        "....KPPKKPPK....",
        "...KPPK..KPPK...",
        "...KPPK..KPPK...",
        "..KBBBK..KBBBK..",
        "..KKKK....KKKK..",
    ],
}
LEGS_SIDE["stepB"] = LEGS_SIDE["stepA"]

BASE = {}
for frame in ("stand", "stepA", "stepB"):
    BASE[("down", frame)] = grid(HEAD_FRONT + TORSO_FRONT + LEGS_FRONT[frame])
    BASE[("up", frame)] = grid(HEAD_FRONT + TORSO_FRONT + LEGS_FRONT[frame])
    BASE[("left", frame)] = grid(HEAD_SIDE + TORSO_SIDE + LEGS_SIDE[frame])

# ---------------- Olhos (só frente e lado) ----------------
EYES = {
    "redondo": {
        "down": grid(["....KW....WK....", "....EE....EE....", "................", "...R..mm....R..."], 6),
        "left": grid(["...WK...........", "...EE...........", "................", "....R.m........."], 6),
    },
    "cilios": {
        "down": grid(["...K..........K.", "....KW....WK....", "....EE....EE....", "................", "...R..mm....R..."], 5),
        "left": grid(["..K.............", "...WK...........", "...EE...........", "................", "....R.m........."], 5),
    },
    "sereno": {
        "down": grid(["....KK....KK....", "....EE....EE....", "................", "...R..mm....R..."], 6),
        "left": grid(["...KK...........", "...EE...........", "................", "....R.m........."], 6),
    },
    "feliz": {
        "down": grid([".....K....K.....", "....K.K..K.K....", "................", "...R..mm....R..."], 6),
        "left": grid(["....K...........", "...K.K..........", "................", "....R.m........."], 6),
    },
}

# ---------------- Cabelos ----------------
CAP_FRONT = [
    "................",
    "....KKKKKKKK....",
    "...KHHHHHHHHK...",
    "..KHHHHHHHHHHK..",
    "..KHHHHHHHHHHK..",
]
CAP_SIDE = [
    "................",
    ".....KKKKKKK....",
    "....KHHHHHHHK...",
    "...KHHHHHHHHHK..",
    "...KHHHHHHHHHK..",
]
BACK_SHORT = [
    "................",
    "....KKKKKKKK....",
    "...KHHHHHHHHK...",
    "..KHHHHHHHHHHK..",
    "..KHHHHHHHHHHK..",
    "..KHHHHHHHHHHK..",
    "..KHHHHHHHHHHK..",
    "..KHHHHHHHHHHK..",
    "..KHHHHHHHHHHK..",
    "..KhHHHHHHHHhK..",
    "...KhhhhhhhhK...",
]

HAIR = {
    "curto": {
        "down": grid(CAP_FRONT + [
            "..KHhSSSSSShHK..",
            "..KH........HK..",
            "..Kh........hK..",
        ]),
        "up": grid(BACK_SHORT),
        "left": grid(CAP_SIDE + [
            "...KHhSSHHHHHK..",
            "..........HHHK..",
            "..........hHHK..",
            "...........hhK..",
        ]),
    },
    "espetado": {
        "down": grid([
            "...K..K..K..K...",
            "..KHKKHKKHKKHK..",
            "..KHHHHHHHHHHK..",
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            ".KHHhSHhSHhSHHK.",
            "..KH........HK..",
            "..Kh........hK..",
        ]),
        "up": grid([
            "...K..K..K..K...",
            "..KHKKHKKHKKHK..",
            "..KHHHHHHHHHHK..",
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            "..KHHHHHHHHHHK..",
            "..KHHHHHHHHHHK..",
            "..KHHHHHHHHHHK..",
            "..KhHHHHHHHHhK..",
            "..KhHHHHHHHHhK..",
            "...KhhhhhhhhK...",
        ]),
        "left": grid([
            "......K..K..K...",
            ".....KHKKHKKHK..",
            "....KHHHHHHHHHK.",
            "...KHHHHHHHHHHHK",
            "...KHHHHHHHHHHK.",
            "...KHSHhHHHHHHK.",
            "..........HHHK..",
            "..........hHHK..",
            "...........hhK..",
        ]),
    },
    "franja": {
        "down": grid(CAP_FRONT + [
            "..KhhhhhhhhhhK..",
            "..KH........HK..",
            "..KH........HK..",
            "..Kh........hK..",
        ]),
        "up": grid(BACK_SHORT),
        "left": grid(CAP_SIDE + [
            "...KhhhhHHHHHK..",
            "..........HHHK..",
            "..........HHHK..",
            "..........hhhK..",
        ]),
    },
    "rabo": {
        "down": grid(CAP_FRONT + [
            "..KHhSSSSSShHK..",
            "..KH........HKK.",
            "..Kh........KHHK",
            "............KhHK",
            ".............KK.",
        ]),
        "up": grid(BACK_SHORT + [
            "......KHHK......",
            "......KHhK......",
            "......KhhK......",
            ".......KK.......",
        ]),
        "left": grid(CAP_SIDE + [
            "...KHhSSHHHHHKK.",
            "..........HHHKHK",
            "..........hHHKHK",
            "...........hhKhK",
            "..............KK",
        ]),
    },
    "longo": {
        "down": grid(CAP_FRONT + [
            ".KHHhSSSSSShHHK.",
            ".KHH........HHK.",
            ".KHH........HHK.",
            ".KHh........hHK.",
            ".KHh........hHK.",
            ".KHh........hHK.",
            ".KhK........KhK.",
            ".KK..........KK.",
        ]),
        "up": grid(BACK_SHORT[:-2] + [
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            ".KhHHHHHHHHHHhK.",
            ".KhHhHHhHHhHHhK.",
            "..KhKhhKhhKhhK..",
            "...K..K..K..K...",
        ]),
        "left": grid(CAP_SIDE + [
            "...KHhSSHHHHHK..",
            ".........HHHHHK.",
            ".........HHHHHK.",
            ".........hHHHHK.",
            ".........hHHHHK.",
            ".........KhHHhK.",
            ".........KhhhhK.",
            "..........KKKK..",
        ]),
    },
    "coque": {
        "down": grid([
            "......KKKK......",
            ".....KHHHHK.....",
            "....KKHhhHKK....",
            "...KHHHHHHHHK...",
            "..KHHHHHHHHHHK..",
            "..KHhSSSSSShHK..",
            "..KH........HK..",
        ], 0),
        "up": grid([
            "......KKKK......",
            ".....KHHHHK.....",
            "....KKHhhHKK....",
        ] + BACK_SHORT[3:]),
        "left": grid([
            "..........KKK...",
            ".........KHHHK..",
            ".....KKKKKHhHK..",
            "...KHHHHHHHKK...",
            "...KHHHHHHHHHK..",
            "...KHhSSHHHHHK..",
            "..........HHHK..",
            "..........hHHK..",
        ], 0),
    },
    "cacheado": {
        "down": grid([
            "....KK.KK.KK....",
            "...KHHKHHKHHK...",
            "..KHHHHHHHHHHK..",
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            ".KHhHSSSSSShHHK.",
            ".KHH........HHK.",
            ".KhH........HhK.",
            "..KK........KK..",
        ]),
        "up": grid([
            "....KK.KK.KK....",
            "...KHHKHHKHHK...",
            "..KHHHHHHHHHHK..",
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            ".KHHHHHHHHHHHHK.",
            ".KhHHHHHHHHHHhK.",
            "..KhHHHHHHHHhK..",
            "...KhhhhhhhhK...",
        ]),
        "left": grid([
            ".....KK.KK.KK...",
            "....KHHKHHKHHK..",
            "...KHHHHHHHHHHK.",
            "..KHHHHHHHHHHHHK",
            "..KHHHHHHHHHHHHK",
            "...KHSSHHHHHHHHK",
            ".........HHHHHK.",
            ".........hHHHhK.",
            "..........KKKK..",
        ]),
    },
}

# ---------------- Chapéus ----------------
HAT = {
    "nenhum": None,
    "bone": {
        "down": grid([
            "................",
            "....KKKKKKKK....",
            "...KCCCCCCCCK...",
            "..KCCCCCCCCCCK..",
            ".KccccccccccccK.",
            "..KKKKKKKKKKKK..",
        ]),
        "up": grid([
            "................",
            "....KKKKKKKK....",
            "...KCCCCCCCCK...",
            "..KCCCCCCCCCCK..",
            "..KCCCKKKKCCCK..",
        ]),
        "left": grid([
            "................",
            ".....KKKKKKK....",
            "....KCCCCCCCK...",
            "...KCCCCCCCCCK..",
            "KccccccCCCCCCK..",
            ".KKKKKK.........",
        ]),
    },
    "gorro": {
        "down": grid([
            "......KKKK......",
            "....KKCCCCKK....",
            "...KCCCCCCCCK...",
            "..KCCCCCCCCCCK..",
            "..KccccccccccK..",
            "..KKKKKKKKKKKK..",
        ]),
        "up": grid([
            "......KKKK......",
            "....KKCCCCKK....",
            "...KCCCCCCCCK...",
            "..KCCCCCCCCCCK..",
            "..KccccccccccK..",
            "..KKKKKKKKKKKK..",
        ]),
        "left": grid([
            "........KKKK....",
            ".....KKKCCCCK...",
            "....KCCCCCCCK...",
            "...KCCCCCCCCCK..",
            "...KcccccccccK..",
            "...KKKKKKKKKKK..",
        ]),
    },
}

# ---------------- Roupa de cima: transformações sobre o corpo ----------------
# Cada estilo lista pixels a sobrescrever: (direção, linha, coluna, chave)
def cells(direction, row, cols, key):
    return [(direction, row, c, key) for c in cols]

TOPS = {
    "camiseta": [],
    "jaqueta": (
        [(d, r, c, k) for d in ("down",) for r in range(13, 17) for c, k in ((7, "I"), (8, "I"), (6, "t"), (9, "t"))]
        + cells("down", 12, (7, 8), "I")
    ),
    "regata": (
        [(d, r, c, "S") for d in ("down", "up") for r in (13, 14, 15) for c in (3, 12)]
        + [("left", r, c, "S") for r in (14, 15) for c in (5, 6)]
    ),
    "moletom": (
        cells("down", 12, (4, 5, 6, 9, 10, 11), "t")
        + cells("down", 16, (6, 7, 8, 9), "t")
        + cells("up", 11, (5, 6, 7, 8, 9, 10), "t")
        + cells("up", 12, (4, 5, 6, 7, 8, 9, 10, 11), "t")
        + cells("left", 11, (9, 10, 11), "t")
        + cells("left", 12, (9, 10, 11), "t")
    ),
}

# ---------------- Roupa de baixo ----------------
SKIRT = {
    "down": grid(["...KPPPPPPPPK...", "..KPPPPPPPPPPK..", "..KKKKKKKKKKKK.."], 18),
    "up": grid(["...KPPPPPPPPK...", "..KPPPPPPPPPPK..", "..KKKKKKKKKKKK.."], 18),
    "left": grid(["....KPPPPPPPK...", "...KPPPPPPPPPK..", "...KKKKKKKKKKK.."], 18),
}
# "skinFrom": a partir desta linha, pixels de calça viram pele
BOTTOMS = {
    "calca": {"skinFrom": 99, "overlay": None},
    "bermuda": {"skinFrom": 20, "overlay": None},
    "saia": {"skinFrom": 20, "overlay": SKIRT},
}

FRAMES = ["stand", "stepA", "stepB"]


def export():
    return {
        "w": W,
        "h": H,
        "dirs": DIRS,
        "frames": FRAMES,
        "base": {f"{d}:{f}": BASE[(d, f)] for d in DIRS for f in FRAMES},
        "eyes": EYES,
        "hair": HAIR,
        "hats": {k: v for k, v in HAT.items()},
        "tops": {k: [list(x) for x in v] for k, v in TOPS.items()},
        "bottoms": BOTTOMS,
    }


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, "shared", "avatar", "parts.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(export(), f, separators=(",", ":"))
    print("gerado:", out)
