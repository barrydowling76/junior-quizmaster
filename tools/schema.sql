-- Junior Quizmaster: class "Lightning maths" board.
-- Tables are closed to the public API; the app only calls the jq_* functions below.

create table if not exists public.classes (
  code text primary key check (code ~ '^[A-Z]{3,4}[0-9]{4}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key,
  class_code text not null references public.classes(code) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 20),
  initial text not null default '' check (initial ~ '^[A-Z]?$'),
  age int not null check (age between 3 and 13),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists players_class_idx on public.players(class_code);

create table if not exists public.speed_runs (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  class_code text not null references public.classes(code) on delete cascade,
  ms int not null check (ms between 700 and 60000),          -- under 0.7 s is not a real spoken answer
  question_id text not null check (char_length(question_id) <= 8),
  day date not null default (now() at time zone 'Europe/Dublin')::date,
  created_at timestamptz not null default now(),
  unique (player_id, question_id, day)                        -- one go per child per question per day
);
create index if not exists speed_runs_class_idx on public.speed_runs(class_code, ms);

alter table public.classes enable row level security;
alter table public.players enable row level security;
alter table public.speed_runs enable row level security;
revoke all on public.classes, public.players, public.speed_runs from anon, authenticated;

-- New class with a friendly code like OWL4821 (shown as OWL-4821).
create or replace function public.jq_create_class() returns text
language plpgsql security definer set search_path = public as $$
declare words text[] := array['OWL','FOX','BEE','ELK','OAK','SUN','STAR','MOON','WAVE','FERN','HARE','WREN','SEAL','LARK'];
        c text; tries int := 0;
begin
  loop
    c := words[1 + floor(random() * array_length(words, 1))::int] || lpad(floor(random() * 10000)::int::text, 4, '0');
    if c !~ '^[A-Z]{3,4}[0-9]{4}$' then continue; end if;
    begin insert into classes(code) values (c); return c;
    exception when unique_violation then tries := tries + 1; if tries > 20 then raise exception 'could not make a class code'; end if; end;
  end loop;
end $$;

-- Put a child in a class (or move them, or update their name/age).
create or replace function public.jq_join(p_code text, p_player uuid, p_first text, p_initial text, p_age int) returns json
language plpgsql security definer set search_path = public as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
        old text;
begin
  select class_code into old from players where id = p_player;
  if not exists (select 1 from classes where code = c) then return json_build_object('ok', false, 'error', 'no_class'); end if;
  insert into players(id, class_code, first_name, initial, age)
  values (p_player, c, left(trim(p_first), 20), upper(left(coalesce(trim(p_initial), ''), 1)), p_age)
  on conflict (id) do update set class_code = excluded.class_code, first_name = excluded.first_name,
    initial = excluded.initial, age = excluded.age, updated_at = now();
  if old is not null and old <> c then
    delete from speed_runs where player_id = p_player and class_code = old;   -- moving class: the old class keeps no trace
  end if;
  return json_build_object('ok', true, 'class', c);
end $$;

-- Save one correct maths answer time.
create or replace function public.jq_record(p_player uuid, p_ms int, p_question text) returns json
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  select class_code into c from players where id = p_player;
  if c is null then return json_build_object('ok', false, 'error', 'no_player'); end if;
  if p_ms is null or p_ms < 700 or p_ms > 60000 then return json_build_object('ok', false, 'error', 'out_of_range'); end if;
  insert into speed_runs(player_id, class_code, ms, question_id) values (p_player, c, p_ms, p_question)
  on conflict (player_id, question_id, day) do nothing;
  return json_build_object('ok', true);
end $$;

-- The class board: each child's best time, top 3 this week and top 3 ever. Never shows anyone's slow times.
create or replace function public.jq_board(p_code text) returns json
language sql security definer set search_path = public as $$
  with c as (select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as code),
  wk as (select date_trunc('week', (now() at time zone 'Europe/Dublin'))::date as monday),
  best_all as (
    select distinct on (r.player_id) r.player_id, r.ms, r.day from speed_runs r, c where r.class_code = c.code order by r.player_id, r.ms),
  best_wk as (
    select distinct on (r.player_id) r.player_id, r.ms, r.day from speed_runs r, c, wk where r.class_code = c.code and r.day >= wk.monday order by r.player_id, r.ms)
  select json_build_object(
    'exists', exists (select 1 from classes, c where classes.code = c.code),
    'players', (select count(*) from players, c where players.class_code = c.code),
    'alltime', coalesce((select json_agg(x) from (select p.first_name || case when p.initial <> '' then ' ' || p.initial || '.' else '' end as name, b.ms, b.day
                 from best_all b join players p on p.id = b.player_id order by b.ms limit 3) x), '[]'::json),
    'week', coalesce((select json_agg(x) from (select p.first_name || case when p.initial <> '' then ' ' || p.initial || '.' else '' end as name, b.ms, b.day
                 from best_wk b join players p on p.id = b.player_id order by b.ms limit 3) x), '[]'::json));
$$;

-- A parent removes their child from the class (and their times).
create or replace function public.jq_leave(p_player uuid) returns json
language sql security definer set search_path = public as $$
  delete from players where id = p_player returning json_build_object('ok', true);
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.jq_create_class(), public.jq_join(text, uuid, text, text, int), public.jq_record(uuid, int, text),
  public.jq_board(text), public.jq_leave(uuid) to anon;
