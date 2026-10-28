import { Client, Room } from "colyseus.js";
import { ROOM_NAME } from "../../shared/constants";

// Em dev o servidor roda na porta 2567 da mesma máquina.
// Em produção o próprio servidor entrega a página, então usa o mesmo endereço.
// Para um servidor em outro endereço, defina VITE_SERVER_URL (ex.: wss://jogo.seudominio.com).
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? `ws://${window.location.hostname}:2567`
    : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`);

const HTTP_URL = SERVER_URL.replace(/^ws/, "http");

export type ServerConfig =
  | { auth: "local" }
  | { auth: "supabase"; supabaseUrl: string; supabaseAnonKey: string };

/** Pergunta ao servidor como é o login (local ou e-mail pelo Supabase). */
export async function loadServerConfig(): Promise<ServerConfig> {
  const res = await fetch(`${HTTP_URL}/config`, { cache: "no-store" });
  if (!res.ok) throw new Error(`config ${res.status}`);
  return res.json();
}

export interface JoinOptions {
  // modo local
  mode?: "login" | "register";
  name?: string;
  password?: string;
  starter?: string;
  look?: string;
  // modo Supabase
  token?: string;
  create?: { name: string; look: string; starter: string };
}

export async function connect(options: JoinOptions): Promise<Room> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate(ROOM_NAME, options);
}
