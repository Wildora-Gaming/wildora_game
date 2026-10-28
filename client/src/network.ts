import { Client, Room } from "colyseus.js";
import { ROOM_NAME } from "../../shared/constants";

// Em dev o servidor roda na porta 2567 da mesma máquina.
// Para produção, defina VITE_SERVER_URL (ex.: wss://jogo.seudominio.com).
// Em produção o próprio servidor entrega a página, então usa o mesmo endereço.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? `ws://${window.location.hostname}:2567`
    : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`);

export interface JoinOptions {
  mode: "login" | "register";
  name: string;
  password: string;
  starter?: string;
  look?: string;
}

export async function connect(options: JoinOptions): Promise<Room> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate(ROOM_NAME, options);
}
