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
  /** último pedido de movimento processado (o cliente usa para confirmar a previsão) */
  declare seq: number;

  constructor() {
    super();
    this.name = "";
    this.x = 0;
    this.y = 0;
    this.dir = "down";
    this.color = 0xffffff;
    this.inBattle = false;
    this.look = "";
    this.seq = 0;
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
  seq: "uint32",
});

/** Lendário no mapa durante o evento (speciesId vazio = nenhum). */
export class Legend extends Schema {
  declare speciesId: string;
  declare x: number;
  declare y: number;
  /** alguém está batalhando com ele agora */
  declare busy: boolean;
  /** quando some (ms desde 1970) */
  declare endsAt: number;
  constructor() {
    super();
    this.speciesId = "";
    this.x = 0;
    this.y = 0;
    this.busy = false;
    this.endsAt = 0;
  }
}
defineTypes(Legend, {
  speciesId: "string",
  x: "uint8",
  y: "uint8",
  busy: "boolean",
  endsAt: "float64",
});

export class WorldState extends Schema {
  declare players: MapSchema<Player>;
  declare legend: Legend;
  /** Noite no ciclo dia/noite (afeta encontros e o visual) */
  declare night: boolean;

  constructor() {
    super();
    this.players = new MapSchema<Player>();
    this.night = false;
    this.legend = new Legend();
  }
}
defineTypes(WorldState, {
  players: { map: Player },
  night: "boolean",
  legend: Legend,
});
