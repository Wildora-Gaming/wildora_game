import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { WorldRoom } from "./rooms/WorldRoom";
import { Store } from "./store";
import { ROOM_NAME } from "../../shared/constants";

const port = Number(process.env.PORT ?? 2567);
const here = dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.DATA_FILE ?? resolve(here, "../data/wildora.json");
const clientDist = resolve(here, "../../client/dist");

// Em produção (depois de `npm run build`) o mesmo servidor entrega o jogo: um endereço só.
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = normalize(join(clientDist, url));
  if (!file.startsWith(clientDist)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(clientDist, "index.html");
  if (!existsSync(file)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Servidor do Wildora no ar. Rode `npm run build` para servir o jogo daqui, ou use `npm run dev`.");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

const store = new Store(dataFile);
WorldRoom.store = store;
const httpServer = createServer(serveStatic);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define(ROOM_NAME, WorldRoom);

await gameServer.listen(port);
console.log(`Servidor do Wildora ouvindo na porta ${port}`);
if (existsSync(join(clientDist, "index.html"))) console.log(`Jogo disponível em http://localhost:${port}`);
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
