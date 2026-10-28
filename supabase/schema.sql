-- Wildora: tabelas do progresso dos jogadores.
-- Rode uma vez no Supabase (SQL Editor → New query → cole este arquivo → Run).
-- Pode rodar de novo sem problema: só cria o que ainda não existe.
--
-- O servidor do jogo grava aqui usando a conexão direta (DATABASE_URL), que ignora as
-- regras de acesso (RLS). As políticas abaixo só deixam cada jogador LER os próprios dados
-- caso um dia o site consulte o banco direto pelo navegador.

-- Treinador: um por conta (o id é o mesmo do usuário em auth.users)
create table if not exists public.trainers (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 16),
  name_key    text not null,
  look        text not null,
  x           integer not null,
  y           integer not null,
  dir         text not null default 'down',
  money       integer not null default 0 check (money >= 0),
  wins        integer not null default 0,
  caught      integer not null default 0,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create unique index if not exists trainers_name_key on public.trainers (name_key);

-- Criaturas: de quem é, onde está (time ou caixa), nível, XP, golpes e quem capturou
create table if not exists public.creatures (
  id            text primary key,
  owner_id      uuid not null references public.trainers (id) on delete cascade,
  species_id    text not null,
  level         integer not null check (level between 1 and 100),
  xp            integer not null default 0,
  hp            integer not null default 0,
  status        text,
  status_turns  integer not null default 0,
  moves         text[] not null default '{}',
  location      text not null check (location in ('team', 'box')),
  slot          integer not null,
  caught_by     uuid references public.trainers (id) on delete set null,
  caught_at     timestamptz not null default now(),
  caught_zone   text,
  updated_at    timestamptz not null default now()
);
create index if not exists creatures_owner on public.creatures (owner_id, location, slot);

-- Mochila
create table if not exists public.inventory (
  owner_id  uuid not null references public.trainers (id) on delete cascade,
  item_id   text not null,
  qty       integer not null check (qty > 0),
  primary key (owner_id, item_id)
);

-- Criaturopédia: espécies vistas e capturadas
create table if not exists public.dex (
  owner_id    uuid not null references public.trainers (id) on delete cascade,
  species_id  text not null,
  seen_at     timestamptz not null default now(),
  caught_at   timestamptz,
  primary key (owner_id, species_id)
);

-- Insígnias dos ginásios
create table if not exists public.badges (
  owner_id   uuid not null references public.trainers (id) on delete cascade,
  gym_id     text not null,
  earned_at  timestamptz not null default now(),
  primary key (owner_id, gym_id)
);

-- Regras de acesso: cada jogador só lê o que é dele
alter table public.trainers  enable row level security;
alter table public.creatures enable row level security;
alter table public.inventory enable row level security;
alter table public.dex       enable row level security;
alter table public.badges    enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'le_proprio_treinador') then
    create policy le_proprio_treinador on public.trainers for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'le_proprias_criaturas') then
    create policy le_proprias_criaturas on public.creatures for select using (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'le_propria_mochila') then
    create policy le_propria_mochila on public.inventory for select using (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'le_propria_dex') then
    create policy le_propria_dex on public.dex for select using (auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'le_proprias_insignias') then
    create policy le_proprias_insignias on public.badges for select using (auth.uid() = owner_id);
  end if;
end $$;
