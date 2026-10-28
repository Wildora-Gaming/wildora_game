import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WorldRoom } from "./rooms/WorldRoom";
import { Store } from "./store";
import { ROOM_NAME } from "../../shared/constants";

const port = Number(process.env.PORT ?? 2567);
const here = dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE ?? resolve(here, "../data/wildora.json");

const store = new Store(dataFile);
const gameServer = new Server({ transport: new WebSocketTransport() });
WorldRoom.store = store;
gameServer.define(ROOM_NAME, WorldRoom);

await gameServer.listen(port);
console.log(`Servidor do Wildora ouvindo em ws://localhost:${port}`);
console.log(`Progresso salvo em ${dataFile} (${store.size} contas)`);

// Grava tudo antes de sair (Ctrl+C)
const shutdown = async () => {
  store.flush();
  await gameServer.gracefullyShutdown(false).catch(() => {});
  store.flush();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
