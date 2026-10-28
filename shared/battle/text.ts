// Texto dos eventos de batalha, usado pelo cliente.
import { getMove } from "./data";
import type { BattleEvent, Side } from "./engine";

export interface BattleNames {
  player: string;
  foe: string;
}

export function sideName(side: Side, names: BattleNames, wild = true): string {
  return side === "player" ? names.player : wild ? `${names.foe} selvagem` : names.foe;
}

const STATUS_TEXT: Record<string, string> = {
  queimado: "ficou queimado",
  paralisado: "ficou paralisado",
  adormecido: "caiu no sono",
  envenenado: "foi envenenado",
  assustado: "ficou assustado",
};

const SKIP_TEXT: Record<string, string> = {
  adormecido: "está dormindo",
  paralisado: "está paralisado e não conseguiu se mexer",
  assustado: "está assustado demais para agir",
  queimado: "não conseguiu agir",
  envenenado: "não conseguiu agir",
};

const TICK_TEXT: Record<string, string> = {
  queimado: "sofre com a queimadura",
  envenenado: "sofre com o veneno",
};

/** Retorna a frase do evento, ou null para eventos sem texto próprio. */
export function describeEvent(e: BattleEvent, names: BattleNames, wild = true): string | null {
  const who = (s: Side) => sideName(s, names, wild);
  switch (e.t) {
    case "use":
      return `${who(e.side)} usou ${getMove(e.moveId).name}!`;
    case "miss":
      return `O golpe de ${who(e.side)} errou!`;
    case "damage": {
      const parts: string[] = [];
      if (e.crit) parts.push("Golpe crítico!");
      if (e.eff > 1) parts.push("Foi super efetivo!");
      else if (e.eff < 1) parts.push("Não foi muito efetivo...");
      return parts.length ? parts.join(" ") : null;
    }
    case "status":
      return `${who(e.side)} ${STATUS_TEXT[e.status]}!`;
    case "status_fail":
      return "Mas não teve efeito.";
    case "skip":
      return `${who(e.side)} ${SKIP_TEXT[e.status]}.`;
    case "wake":
      return `${who(e.side)} acordou!`;
    case "calm":
      return `${who(e.side)} se acalmou.`;
    case "tick":
      return `${who(e.side)} ${TICK_TEXT[e.status] ?? "sofre dano"}.`;
    case "faint":
      return `${who(e.side)} desmaiou!`;
    case "run":
      return e.ok ? "Você fugiu em segurança!" : "Não conseguiu fugir!";
    case "xp":
      return `${names.player} ganhou ${e.amount} de XP!`;
    case "level":
      return `${names.player} subiu para o nível ${e.level}!`;
    case "learn":
      return `${names.player} aprendeu ${getMove(e.moveId).name}!`;
    case "end":
      return e.result === "lose" ? "Você correu de volta para a trilha central para recuperar o time." : null;
  }
}
