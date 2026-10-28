// Estado de interface compartilhado entre a cena do mundo e as telas em HTML.
import type { ProfileMessage } from "../../shared/constants";

export const uiState = {
  /** Em batalha: o mundo não lê o teclado. */
  inBattle: false,
  /** Um painel (time, mochila, loja, diálogo) está aberto. */
  modalOpen: false,
  /** Último perfil recebido do servidor. */
  profile: null as ProfileMessage | null,
};

/** True quando o mundo não deve reagir ao teclado. */
export function inputBlocked() {
  return uiState.inBattle || uiState.modalOpen || document.activeElement?.tagName === "INPUT";
}

type Listener = (p: ProfileMessage) => void;
const listeners: Listener[] = [];

export function onProfile(fn: Listener) {
  listeners.push(fn);
  if (uiState.profile) fn(uiState.profile);
}

export function setProfile(p: ProfileMessage) {
  uiState.profile = p;
  for (const fn of listeners) fn(p);
}
