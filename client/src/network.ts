import { Client, Room } from "colyseus.js";
import { ROOM_NAME } from "../../shared/constants";

// Em dev o servidor roda na porta 2567 da mesma máquina.
// Para produção, defina VITE_SERVER_URL (ex.: wss://jogo.seudominio.com).
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? `ws://${window.location.hostname}:2567`;

export async function connect(name: string, starter: string): Promise<Room> {
  const client = new Client(SERVER_URL);
  return client.joinOrCreate(ROOM_NAME, { name, starter });
}
