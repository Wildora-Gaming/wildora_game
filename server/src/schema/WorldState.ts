import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

// Estado sincronizado automaticamente com todos os clientes da sala.
// Só entra aqui o que os OUTROS jogadores precisam ver. Dados privados
// (time de criaturas, inventário) vão por mensagem direta ou ficam só no banco.

export class Player extends Schema {
  declare name: string;
  declare x: number;
  declare y: number;
  declare dir: string;
  declare color: number;
  /** Em batalha: os outros veem um aviso sobre a cabeça. */
  declare inBattle: boolean;
  /** Aparência na forma compacta (ver shared/avatar/look.ts) */
  declare look: string;

  constructor() {
    super();
    this.name = "";
    this.x = 0;
    this.y = 0;
    this.dir = "down";
    this.color = 0xffffff;
    this.inBattle = false;
    this.look = "";
  }

  static create(name: string, x: number, y: number, color: number) {
    const p = new Player();
    p.name = name;
    p.x = x;
    p.y = y;
    p.color = color;
    return p;
  }
}
defineTypes(Player, {
  name: "string",
  x: "uint8",
  y: "uint8",
  dir: "string",
  color: "uint32",
  inBattle: "boolean",
  look: "string",
});

export class WorldState extends Schema {
  declare players: MapSchema<Player>;

  constructor() {
    super();
    this.players = new MapSchema<Player>();
  }
}
defineTypes(WorldState, {
  players: { map: Player },
});
