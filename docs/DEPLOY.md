# Colocar o Wildora no ar

Com isto seus amigos jogam por um link, com conta de e-mail (confirmação, esqueci a senha) e todo o
progresso salvo no Supabase: personagem, criaturas (quem capturou, onde, nível, XP), mochila, dex e insígnias.

Fica assim:

```
navegador ──► Render (servidor do jogo: página + multiplayer)  ──► Supabase Postgres (progresso)
     └──────► Supabase Auth (cadastro, confirmação por e-mail, senha) ◄── e-mails saem pelo Brevo
```

> **Por que não o GitHub Pages?** O Pages só hospeda páginas estáticas. O Wildora precisa de um
> servidor rodando o tempo todo (o multiplayer e as batalhas são decididos lá). O GitHub fica como a
> origem do código: cada `git push` na `main` roda os testes e, se passarem, o Render publica sozinho.

**Segredos:** a senha do banco (`DATABASE_URL`) e as chaves vão só nas variáveis de ambiente do Render
(ou no `.env` da sua máquina). Nunca no GitHub, nunca em chat. A única chave que pode aparecer no
navegador é a pública (publishable/anon).

Tempo total: uns 30 minutos.

---

## 1. Supabase: projeto e tabelas

1. Crie uma conta em <https://supabase.com> e clique em **New project**.
   - **Region:** escolha **East US (North Virginia)**. Fica do lado do servidor do Render
     (passo 4), então salvar o progresso é rápido. Quando for para a Oracle em São Paulo, dá para
     criar o banco em São Paulo também.
   - Anote a **senha do banco** que você definir (vai na `DATABASE_URL`).
2. Abra **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](../supabase/schema.sql)
   e clique em **Run**. Pode rodar de novo sem medo: só cria o que falta.
3. Em **Table Editor** devem aparecer `trainers`, `creatures`, `inventory`, `dex` e `badges`.

### Pegue os três valores

| Variável | Onde achar |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API → *Project URL* (`https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Project Settings → API Keys → *Publishable key* (`sb_publishable_...`) ou a *anon* (legacy) |
| `DATABASE_URL` | Botão **Connect** (topo) → *Connection string* → **Session pooler** → troque `[YOUR-PASSWORD]` pela senha do banco |

Use o **Session pooler** (porta 5432, host `...pooler.supabase.com`): a conexão "Direct" só funciona
em IPv6 e o Render usa IPv4.

## 2. Supabase: e-mails de verdade (Brevo)

O e-mail embutido do Supabase **só entrega para os membros do seu time no Supabase** e no máximo
2 por hora. Para seus amigos receberem a confirmação e o "esqueci a senha", ligue um SMTP grátis:

1. Crie conta no <https://www.brevo.com> (grátis: 300 e-mails por dia).
2. Em **Senders, Domains & Dedicated IPs → Senders**, adicione e confirme o endereço remetente
   (pode ser seu Gmail; com um domínio próprio verificado os e-mails caem menos no spam).
3. Em **SMTP & API → SMTP**, gere uma **SMTP key**. Anote o *login* (algo como `xxxx@smtp-brevo.com`).
4. No Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**:
   - Sender email: o remetente confirmado no Brevo · Sender name: `Wildora`
   - Host: `smtp-relay.brevo.com` · Port: `587`
   - Username: o login SMTP do Brevo · Password: a SMTP key
5. **Authentication → Rate Limits:** o limite de e-mails começa em 30/hora; aumente se precisar.

(Opcional) Em **Authentication → Emails → Templates** dá para traduzir os textos. Mantenha o link
`{{ .ConfirmationURL }}` no corpo.

## 3. Supabase: login por e-mail

Em **Authentication → Sign In / Providers → Email**:
- **Enable email provider:** ligado
- **Confirm email:** ligado (a primeira entrada exige clicar no link)
- **Minimum password length:** 6 (o jogo já pede 6)

As URLs do jogo entram depois do passo 4, quando você tiver o endereço do Render.

## 4. Render: o servidor do jogo

1. Crie conta em <https://render.com> entrando com o GitHub e autorize o repositório
   `Wildora-Gaming/wildora_game`.
2. **New → Blueprint** → escolha o repositório. O Render lê o [`render.yaml`](../render.yaml) e
   pergunta três valores: cole `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `DATABASE_URL` do passo 1.
3. **Apply.** O primeiro build leva uns 3 minutos. O endereço fica algo como
   `https://wildora.onrender.com` (ou `wildora-xxxx.onrender.com`).
4. Abra `https://SEU-ENDERECO.onrender.com/healthz`: deve mostrar `ok`.

Os logs do serviço devem mostrar:

```
Login: e-mail (Supabase)
Progresso: Postgres (Supabase) (0 treinadores)
```

## 5. Ligue o Supabase ao endereço do jogo

No Supabase, **Authentication → URL Configuration**:
- **Site URL:** `https://SEU-ENDERECO.onrender.com`
- **Redirect URLs:** adicione `https://SEU-ENDERECO.onrender.com/**`
  (e `http://localhost:5173/**` se quiser testar o login por e-mail rodando na sua máquina)

Sem isso, o link do e-mail leva para o lugar errado.

## 6. Teste

1. Abra o endereço do Render → **Criar conta** com seu e-mail.
2. Chega o e-mail "Confirm your signup" → clique no link → você volta ao jogo já logado, no criador
   de personagem.
3. Crie o personagem, capture algo, feche a aba, abra de novo: tudo continua lá.
4. Teste **Esqueci minha senha**.
5. No Supabase, **Table Editor → creatures** mostra as criaturas com `caught_by` (quem capturou),
   `caught_zone` (onde), nível e XP.

Mande o link para os amigos. Cada um cria a própria conta.

### Limites do plano grátis (bom saber)

- **Render free:** o servidor dorme depois de 15 minutos sem ninguém acessando. A primeira pessoa a
  abrir espera uns 50 segundos enquanto ele acorda. Para ficar sempre ligado: plano pago do Render
  ou a Oracle (abaixo).
- **Supabase free:** o projeto pausa depois de 7 dias sem uso. Basta reativar no painel.
- O servidor fica nos EUA (Virginia): uns 120 ms de ping a partir do Brasil, o que não atrapalha
  (o movimento é previsto no próprio navegador). Na Oracle em São Paulo cai para uns 10 a 30 ms.

### Atualizar o jogo

Só `git push` na `main`. O GitHub Actions roda os testes ([`ci.yml`](../.github/workflows/ci.yml)) e,
se passarem, o Render publica (`autoDeployTrigger: checksPass`). Quem estiver jogando é desconectado
por alguns segundos; o progresso é gravado antes do servidor reiniciar.

---

## Depois: domínio próprio e Oracle

### Só o domínio, ainda no Render

Render → serviço → **Settings → Custom Domains** → adicione `jogo.seudominio.com` e crie o registro
CNAME que ele mostrar no seu provedor de domínio. Depois troque a **Site URL** e as **Redirect URLs**
do Supabase (passo 5) para o domínio novo.

### Oracle Cloud (Always Free)

Uma VM grátis que não dorme, com o [`Dockerfile`](../Dockerfile) e o Caddy cuidando do HTTPS.

1. Crie uma VM **Ubuntu** (Ampere A1 serve) na região **Brazil East (São Paulo)**.
2. Na **Security List** da rede (VCN), libere entrada TCP **80** e **443**. As imagens Ubuntu da Oracle
   também bloqueiam no firewall interno; libere na VM:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```
3. No seu provedor de domínio, crie um registro **A**: `jogo.seudominio.com` → IP público da VM.
4. Na VM:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   git clone https://github.com/Wildora-Gaming/wildora_game.git && cd wildora_game
   cp .env.example .env && nano .env        # cole SUPABASE_URL, SUPABASE_ANON_KEY e DATABASE_URL
   cd deploy/oracle
   sudo DOMAIN=jogo.seudominio.com docker compose up -d --build
   ```
   O Caddy pega o certificado HTTPS sozinho. Abra `https://jogo.seudominio.com`.
5. Troque a **Site URL** e as **Redirect URLs** do Supabase para o domínio.
6. Para atualizar: `git pull && sudo DOMAIN=jogo.seudominio.com docker compose up -d --build`.

Para um banco em São Paulo também: crie outro projeto Supabase na região **South America (São Paulo)**,
rode o `schema.sql` e troque as três variáveis. As contas não migram sozinhas entre projetos, então
faça isso antes de ter muita gente jogando.

---

## Rodar na sua máquina

- **Sem configurar nada:** `npm run dev` → <http://localhost:5173>. Login local por nome e senha,
  progresso em `server/data/wildora.json`.
- **Com o Supabase:** copie `.env.example` para `.env`, preencha, e rode `npm run dev`. O servidor
  lê o `.env` sozinho e o navegador passa a pedir e-mail. Lembre de pôr `http://localhost:5173/**`
  nas Redirect URLs.
- **Igual à produção:** `npm start` (compila o cliente e serve tudo em <http://localhost:2567>).

## Problemas comuns

| Sintoma | Causa provável |
| --- | --- |
| "Email address not authorized" ao criar conta | SMTP próprio não configurado (passo 2) |
| O link do e-mail abre `localhost:3000` ou dá erro | Site URL / Redirect URLs (passo 5) |
| "Esse link expirou ou já foi usado" | O link vale uma vez e expira; peça outro na tela |
| Log: `DATABASE_URL está definido, mas falta SUPABASE_URL...` | Faltou uma das variáveis no Render |
| Log: `ENETUNREACH` / `getaddrinfo` no banco | Usou a conexão *Direct*; troque pela *Session pooler* |
| Log: `password authentication failed` | Senha errada na `DATABASE_URL` (caracteres especiais precisam de `%xx`) |
| Primeira abertura do dia demora | O Render free estava dormindo; normal |
