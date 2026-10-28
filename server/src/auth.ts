// Autenticação dos jogadores.
// - "local": nome de treinador + senha guardados no arquivo (desenvolvimento, sem configurar nada).
// - "supabase": e-mail e senha no Supabase Auth (confirmação por e-mail, esqueci a senha).
//   O navegador faz o login no Supabase e manda o token; o servidor confere o token
//   perguntando ao próprio Supabase quem é o usuário.
import { ServerError } from "@colyseus/core";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthProvider {
  mode: "local" | "supabase";
  /** confere o token e devolve o usuário (lança ServerError 401 se inválido) */
  verify(token: unknown): Promise<AuthUser>;
}

export const localAuth: AuthProvider = {
  mode: "local",
  async verify() {
    throw new ServerError(400, "Este servidor usa login local (nome e senha).");
  },
};

export function supabaseAuth(url: string, anonKey: string): AuthProvider {
  const base = url.replace(/\/+$/, "");
  return {
    mode: "supabase",
    async verify(token) {
      if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
        throw new ServerError(401, "Sessão inválida. Entre de novo.");
      }
      let res: Response;
      try {
        res = await fetch(`${base}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        throw new ServerError(503, "Não foi possível falar com o servidor de login. Tente de novo.");
      }
      if (res.status === 401 || res.status === 403) throw new ServerError(401, "Sessão expirada. Entre de novo.");
      if (!res.ok) throw new ServerError(503, "O servidor de login respondeu com erro. Tente de novo.");
      const user = (await res.json()) as { id?: string; email?: string; email_confirmed_at?: string | null };
      if (!user.id) throw new ServerError(401, "Sessão inválida. Entre de novo.");
      if (!user.email_confirmed_at) throw new ServerError(403, "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).");
      return { id: user.id, email: user.email ?? "" };
    },
  };
}
