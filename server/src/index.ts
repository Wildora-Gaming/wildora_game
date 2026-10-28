import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { WorldRoom } from "./rooms/WorldRoom";
import { ROOM_NAME } from "../../shared/constants";

const port = Number(process.env.PORT ?? 2567);

export function createServer() {
  const gameServer = new Server({ transport: new WebSocketTransport() });
  gameServer.define(ROOM_NAME, WorldRoom);
  return gameServer;
}

const gameServer = createServer();
await gameServer.listen(port);
console.log(`Servidor do jogo ouvindo em ws://localhost:${port}`);
