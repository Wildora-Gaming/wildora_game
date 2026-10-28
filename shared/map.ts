// Mapa de teste "Campina Inicial".
// Gerado por código para o esqueleto; mais adiante isso vira um mapa do Tiled (.tmj)
// lido pelos dois lados.

export enum Tile {
  Ground = 0,
  Tree = 1,
  TallGrass = 2,
  Water = 3,
  Path = 4,
}

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 28;

export const SPAWN = { x: 20, y: 13 };

function buildMap(): Tile[] {
  const tiles: Tile[] = new Array(MAP_WIDTH * MAP_HEIGHT).fill(Tile.Ground);
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) tiles[y * MAP_WIDTH + x] = t;
  };
  const rect = (x: number, y: number, w: number, h: number, t: Tile) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t);
  };

  // Grama alta (onde acontecem os encontros)
  rect(4, 3, 9, 7, Tile.TallGrass);
  rect(26, 16, 10, 8, Tile.TallGrass);
  rect(3, 18, 8, 6, Tile.TallGrass);

  // Lago
  rect(23, 3, 9, 5, Tile.Water);
  rect(24, 8, 7, 1, Tile.Water);

  // Bosques internos (obstáculos)
  rect(14, 19, 4, 3, Tile.Tree);
  rect(34, 4, 3, 3, Tile.Tree);
  rect(15, 4, 2, 2, Tile.Tree);

  // Caminhos em cruz passando pelo spawn
  rect(1, SPAWN.y, MAP_WIDTH - 2, 1, Tile.Path);
  rect(SPAWN.x, 1, 1, MAP_HEIGHT - 2, Tile.Path);

  // Borda de árvores
  rect(0, 0, MAP_WIDTH, 1, Tile.Tree);
  rect(0, MAP_HEIGHT - 1, MAP_WIDTH, 1, Tile.Tree);
  rect(0, 0, 1, MAP_HEIGHT, Tile.Tree);
  rect(MAP_WIDTH - 1, 0, 1, MAP_HEIGHT, Tile.Tree);

  return tiles;
}

export const MAP_TILES: readonly Tile[] = buildMap();

export function tileAt(x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return Tile.Tree;
  return MAP_TILES[y * MAP_WIDTH + x];
}

export function isWalkable(x: number, y: number): boolean {
  const t = tileAt(x, y);
  return t !== Tile.Tree && t !== Tile.Water;
}
