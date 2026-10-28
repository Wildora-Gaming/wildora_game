import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { WorldRoom } from "./rooms/WorldRoom";
import { authMode, checkConfig, config } from "./config";
import { localAuth, supabaseAuth } from "./auth";
import { FileStore } from "./store/file-store";
import { PgStore } from "./store/pg-store";
import { connectPostgres } from "./store/db";
import type { Store } from "./store/types";
import { ROOM_NAME } from "../../shared/constants";

checkConfig();

// ---------- Armazenamento e login ----------
let store: Store;
if (config.databaseUrl) {
  store = new PgStore(connectPostgres(config.databaseUrl));
} else {
  const file = new FileStore(config.dataFile);
  store = file;
  if (authMode === "local") WorldRoom.local = file;
}
WorldRoom.store = store;
WorldRoom.auth = authMode === "supabase" ? supabaseAuth(config.supabaseUrl!, config.supabaseAnonKey!) : localAuth;

// ---------- HTTP: configuração pública, saúde e o jogo compilado ----------
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

/** O navegador descobre aqui como fazer login (só dados públicos). */
const publicConfig = JSON.stringify(
  authMode === "supabase"
    ? { auth: "supabase", supabaseUrl: config.supabaseUrl, supabaseAnonKey: config.supabaseAnonKey }
    : { auth: "local" },
);

function serve(req: IncomingMessage, res: ServerResponse) {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (url === "/config") {
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    });
    res.end(publicConfig);
    return;
  }
  if (url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  let file = normalize(join(config.clientDist, url));
  if (!file.startsWith(config.clientDist)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(config.clientDist, "index.html");
  if (!existsSync(file)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Servidor do Wildora no ar. Rode `npm run build` para servir o jogo daqui, ou use `npm run dev`.");
    return;
  }
  const headers: Record<string, string> = { "content-type": MIME[extname(file)] ?? "application/octet-stream" };
  // arquivos com hash no nome podem ficar em cache; o index.html não
  headers["cache-control"] = url.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}

const httpServer = createServer(serve);
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define(ROOM_NAME, WorldRoom);

await gameServer.listen(config.port);
console.log(`Servidor do Wildora ouvindo na porta ${config.port}`);
if (existsSync(join(config.clientDist, "index.html"))) console.log(`Jogo disponível em http://localhost:${config.port}`);
console.log(`Login: ${authMode === "supabase" ? "e-mail (Supabase)" : "local (nome e senha)"}`);
console.log(`Progresso: ${store.label} (${await store.count()} treinadores)`);

// Grava tudo antes de sair (Ctrl+C ou o host desligando)
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await store.flush();
  await gameServer.gracefullyShutdown(false).catch(() => {});
  await store.close().catch(() => {});
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
