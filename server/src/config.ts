// Configuração por variáveis de ambiente (veja .env.example).
// Sem nada configurado, o jogo roda em modo local: login por nome e senha, progresso em arquivo.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

// Carrega o .env da raiz do projeto, se existir (Node 20.12+).
for (const file of [resolve(root, ".env"), resolve(root, "server/.env")]) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch (err) {
      console.warn(`[config] não consegui ler ${file}:`, (err as Error).message);
    }
  }
}

const env = (name: string) => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

export const config = {
  port: Number(env("PORT") ?? 2567),
  /** arquivo do modo local */
  dataFile: env("DATA_FILE") ?? resolve(root, "server/data/wildora.json"),
  /** Postgres do Supabase (Settings → Database → Connection string → Session pooler) */
  databaseUrl: env("DATABASE_URL"),
  supabaseUrl: env("SUPABASE_URL"),
  /** chave pública "anon" (pode ir para o navegador) */
  supabaseAnonKey: env("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY"),
  clientDist: resolve(root, "client/dist"),
};

export const authMode: "local" | "supabase" = config.supabaseUrl && config.supabaseAnonKey ? "supabase" : "local";

export function checkConfig() {
  if (config.databaseUrl && authMode !== "supabase") {
    throw new Error(
      "DATABASE_URL está definido, mas falta SUPABASE_URL e SUPABASE_ANON_KEY. " +
        "Com banco de dados, o login precisa ser pelo Supabase (e-mail).",
    );
  }
  if (authMode === "supabase" && !config.databaseUrl) {
    console.warn(
      "[config] Login pelo Supabase ativo, mas sem DATABASE_URL: o progresso fica num arquivo local " +
        "(no Render ele se perde a cada reinício). Defina DATABASE_URL para salvar no Supabase.",
    );
  }
}
