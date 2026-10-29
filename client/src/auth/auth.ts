// Login por e-mail (Supabase Auth): entrar, criar conta, confirmar e-mail, esqueci a senha
// e nova senha. Usa o mesmo visual do criador de personagem.
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import "../creator/creator.css";

export const PASSWORD_MIN = 6;

export function makeSupabase(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // "implicit": o link do e-mail funciona mesmo se aberto em outro aparelho/navegador
      flowType: "implicit",
      storageKey: "wildora-auth",
    },
  });
}

/** Lê o que veio no link do e-mail antes de o Supabase limpar a URL. */
export function readEmailLink(): { recovery: boolean; confirmed: boolean; error: string | null } {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const type = hash.get("type") ?? query.get("type");
  const code = hash.get("error_code") ?? query.get("error_code");
  let error: string | null = null;
  if (code === "otp_expired") error = "Esse link expirou ou já foi usado. Peça um novo abaixo.";
  else if (hash.get("error") || query.get("error")) error = "O link do e-mail não funcionou. Peça um novo abaixo.";
  return { recovery: type === "recovery", confirmed: type === "signup" || type === "email", error };
}

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada (e no spam).";
  if (m.includes("already registered") || m.includes("already been registered")) return "Esse e-mail já tem conta. Use “Entrar” ou “Esqueci minha senha”.";
  if (m.includes("password should be") || m.includes("weak")) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (m.includes("invalid email") || m.includes("unable to validate email")) return "Esse e-mail não parece válido.";
  if (m.includes("same password") || m.includes("different from the old")) return "A nova senha precisa ser diferente da anterior.";
  if (m.includes("signup") && m.includes("disabled")) return "Cadastros estão desativados no momento.";
  if (m.includes("error sending") && m.includes("email"))
    return "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos; se continuar, avise quem cuida do jogo.";
  if (m.includes("fetch") || m.includes("network")) return "Sem conexão com o servidor de login. Verifique a internet.";
  return message;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function input(type: string, placeholder: string, autocomplete: AutoFill, value = "") {
  const i = el("input", "name-input") as HTMLInputElement;
  i.type = type;
  i.placeholder = placeholder;
  i.autocomplete = autocomplete;
  i.value = value;
  if (type === "email") i.maxLength = 120;
  return i;
}

function field(label: string, control: HTMLInputElement) {
  const wrap = el("label", "field");
  wrap.append(el("span", "field-label", label), control);
  return wrap;
}

function button(label: string, kind: "primary" | "ghost" | "link", type: "button" | "submit" = "button") {
  const b = el("button", kind === "link" ? "link-btn" : `btn ${kind}`, label);
  b.type = type;
  return b;
}

const EMAIL_KEY = "wildora:email";
const lastEmail = () => {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
};
const rememberEmail = (email: string) => {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* sem armazenamento */
  }
};

export interface AuthOptions {
  /** mensagem para mostrar na tela inicial (ex.: erro ao entrar no jogo) */
  error?: string;
  /** veio de um link de "esqueci a senha" */
  recovery?: boolean;
  /** veio do link de confirmação */
  confirmed?: boolean;
}

/**
 * Mostra as telas de login até haver uma sessão válida e devolve a sessão.
 * Se já existe sessão salva no navegador (e não é recuperação de senha), devolve direto.
 */
export async function runAuth(root: HTMLElement, supa: SupabaseClient, opts: AuthOptions = {}): Promise<Session> {
  const existing = (await supa.auth.getSession()).data.session;
  if (existing && !opts.recovery && !opts.error) return existing;

  return new Promise((resolve) => {
    root.replaceChildren();
    const shell = el("div", "creator auth");
    root.append(shell);

    const frame = (title: string, subtitle: string) => {
      shell.replaceChildren();
      const hero = el("header", "welcome-hero");
      hero.append(el("h1", "", "Wildora"), el("p", "", subtitle));
      const panel = el("section", "panel auth-panel");
      panel.append(el("h2", "", title));
      const body = el("div", "panel-body auth-body");
      panel.append(body);
      const foot = el("footer", "auth-foot");
      const about = el("a", "", "Sobre o jogo e privacidade");
      about.href = "/sobre.html";
      foot.append(about);
      shell.append(hero, panel, foot);
      return body;
    };

    const busy = (b: HTMLButtonElement, on: boolean, label: string) => {
      b.disabled = on;
      b.textContent = on ? "Aguarde..." : label;
    };

    // ---------- Entrar ----------
    const showLogin = (message = "", kind: "error" | "ok" = "error") => {
      const body = frame("Entrar", "Explore, capture e treine criaturas num mundo compartilhado com outros treinadores.");
      const form = el("form", "auth-form");
      const email = input("email", "seu@email.com", "email", lastEmail());
      const pass = input("password", "Sua senha", "current-password");
      const msg = el("div", kind === "ok" ? "form-ok" : "form-error", message);
      const go = button("Entrar", "primary", "submit");
      const forgot = button("Esqueci minha senha", "link");
      const create = button("Criar conta", "ghost");
      const links = el("div", "auth-links");
      links.append(forgot);
      form.append(field("E-mail", email), field("Senha", pass), msg, go, links, el("div", "auth-sep", "Ainda não tem conta?"), create);
      body.append(form);
      (email.value ? pass : email).focus();

      forgot.addEventListener("click", () => showForgot(email.value));
      create.addEventListener("click", () => showSignup(email.value));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        msg.className = "form-error";
        msg.textContent = "";
        if (!email.value.includes("@") || !pass.value) return void (msg.textContent = "Preencha e-mail e senha.");
        busy(go, true, "Entrar");
        const { data, error } = await supa.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        busy(go, false, "Entrar");
        if (error || !data.session) {
          msg.textContent = translate(error?.message ?? "Não foi possível entrar.");
          if (error?.message.toLowerCase().includes("email not confirmed")) {
            const resend = button("Reenviar e-mail de confirmação", "link");
            resend.addEventListener("click", async () => {
              const r = await supa.auth.resend({ type: "signup", email: email.value.trim(), options: { emailRedirectTo: redirectUrl() } });
              msg.className = r.error ? "form-error" : "form-ok";
              msg.textContent = r.error ? translate(r.error.message) : "Enviamos o e-mail de novo.";
            });
            links.append(resend);
          }
          return;
        }
        rememberEmail(email.value.trim());
        resolve(data.session);
      });
    };

    // ---------- Criar conta ----------
    const showSignup = (prefill = "") => {
      const body = frame("Criar conta", "Crie sua conta com e-mail. Depois você monta seu personagem.");
      const form = el("form", "auth-form");
      const email = input("email", "seu@email.com", "email", prefill);
      const pass = input("password", `Mínimo ${PASSWORD_MIN} caracteres`, "new-password");
      const pass2 = input("password", "Repita a senha", "new-password");
      const msg = el("div", "form-error");
      const go = button("Criar conta", "primary", "submit");
      const back = button("Já tenho conta: entrar", "link");
      form.append(field("E-mail", email), field("Senha", pass), field("Confirmar senha", pass2), msg, go, back);
      body.append(form);
      email.focus();

      back.addEventListener("click", () => showLogin());
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        msg.textContent = "";
        if (!email.value.includes("@")) return void (msg.textContent = "Digite um e-mail válido.");
        if (pass.value.length < PASSWORD_MIN) return void (msg.textContent = `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`);
        if (pass.value !== pass2.value) return void (msg.textContent = "As senhas não são iguais.");
        busy(go, true, "Criar conta");
        const { data, error } = await supa.auth.signUp({
          email: email.value.trim(),
          password: pass.value,
          options: { emailRedirectTo: redirectUrl() },
        });
        busy(go, false, "Criar conta");
        if (error) return void (msg.textContent = translate(error.message));
        rememberEmail(email.value.trim());
        // projeto sem confirmação de e-mail: já vem com sessão
        if (data.session) return resolve(data.session);
        // e-mail já cadastrado: o Supabase responde "sucesso" sem identidades (para não revelar contas)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          return void (msg.textContent = "Esse e-mail já tem conta. Use “Entrar” ou “Esqueci minha senha”.");
        }
        showCheckEmail(email.value.trim());
      });
    };

    const showCheckEmail = (email: string) => {
      const body = frame("Confirme seu e-mail", "Falta só um passo.");
      const msg = el("div", "form-ok");
      const text = el("p", "auth-text");
      text.append(
        "Enviamos um link de confirmação para ",
        el("strong", "", email),
        ". Abra o e-mail e clique no link: você volta para cá já conectado. Não chegou? Veja o spam.",
      );
      const resend = button("Reenviar e-mail", "ghost");
      const back = button("Já confirmei: entrar", "primary");
      body.append(text, msg, back, resend);
      back.addEventListener("click", () => showLogin());
      resend.addEventListener("click", async () => {
        busy(resend, true, "Reenviar e-mail");
        const r = await supa.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectUrl() } });
        busy(resend, false, "Reenviar e-mail");
        msg.className = r.error ? "form-error" : "form-ok";
        msg.textContent = r.error ? translate(r.error.message) : "Enviamos de novo. Confira a caixa de entrada.";
      });
    };

    // ---------- Esqueci a senha ----------
    const showForgot = (prefill = "") => {
      const body = frame("Esqueci minha senha", "Vamos mandar um link para você criar uma senha nova.");
      const form = el("form", "auth-form");
      const email = input("email", "seu@email.com", "email", prefill);
      const msg = el("div", "form-error");
      const go = button("Enviar link", "primary", "submit");
      const back = button("Voltar para entrar", "link");
      form.append(field("E-mail da conta", email), msg, go, back);
      body.append(form);
      email.focus();
      back.addEventListener("click", () => showLogin());
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!email.value.includes("@")) return void (msg.textContent = "Digite um e-mail válido.");
        busy(go, true, "Enviar link");
        const { error } = await supa.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: redirectUrl() });
        busy(go, false, "Enviar link");
        if (error) {
          msg.className = "form-error";
          msg.textContent = translate(error.message);
          return;
        }
        msg.className = "form-ok";
        msg.textContent = "Se existir uma conta com esse e-mail, o link já está a caminho. Confira a caixa de entrada e o spam.";
      });
    };

    // ---------- Nova senha (link do e-mail) ----------
    const showNewPassword = () => {
      const body = frame("Nova senha", "Escolha uma senha nova para a sua conta.");
      const form = el("form", "auth-form");
      const pass = input("password", `Mínimo ${PASSWORD_MIN} caracteres`, "new-password");
      const pass2 = input("password", "Repita a senha", "new-password");
      const msg = el("div", "form-error");
      const go = button("Salvar e entrar", "primary", "submit");
      form.append(field("Nova senha", pass), field("Confirmar", pass2), msg, go);
      body.append(form);
      pass.focus();
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (pass.value.length < PASSWORD_MIN) return void (msg.textContent = `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`);
        if (pass.value !== pass2.value) return void (msg.textContent = "As senhas não são iguais.");
        busy(go, true, "Salvar e entrar");
        const { error } = await supa.auth.updateUser({ password: pass.value });
        busy(go, false, "Salvar e entrar");
        if (error) return void (msg.textContent = translate(error.message));
        const session = (await supa.auth.getSession()).data.session;
        if (session) resolve(session);
        else showLogin("Senha alterada. Entre com a senha nova.", "ok");
      });
    };

    if (opts.recovery && existing) showNewPassword();
    else if (opts.confirmed && existing) resolve(existing);
    else showLogin(opts.error ?? "");
  });
}

export function redirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}
