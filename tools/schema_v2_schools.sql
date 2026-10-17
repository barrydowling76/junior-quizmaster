-- v2: class boards belong to a real school and year. Run after schema.sql and the schools load (schools.sql).
alter table public.classes add column if not exists roll text references public.schools(roll);
alter table public.classes add column if not exists year text check (year in ('JI','SI','1','2','3','4','5','6'));
alter table public.classes add column if not exists label text not null default '' check (char_length(label) <= 30);
-- One shared board per school + year (+ optional class name), so parents who pick the same class land together.
create unique index if not exists classes_school_year_idx on public.classes (roll, year, lower(label)) where roll is not null;

-- Schools in one county, for the picker.
create or replace function public.jq_school_list(p_county text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_array(roll, name, town, area, level, kind) order by area, name), '[]'::json)
  from schools where county = p_county;
$$;

-- What a class link is for (school, area, year), shown to parents who open it.
create or replace function public.jq_class_info(p_code text) returns json
language sql stable security definer set search_path = public as $$
  with c as (select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) as code)
  select json_build_object('exists', cl.code is not null, 'code', cl.code, 'roll', cl.roll, 'school', s.name, 'town', s.town, 'area', s.area,
                           'county', s.county, 'year', cl.year, 'label', cl.label,
                           'players', (select count(*) from players p where p.class_code = cl.code))
  from c left join classes cl on cl.code = c.code left join schools s on s.roll = cl.roll;
$$;

-- Find the board for a school + year (+ class name), or start it.
create or replace function public.jq_school_class(p_roll text, p_year text, p_label text) returns text
language plpgsql security definer set search_path = public as $$
declare c text; lbl text := left(trim(coalesce(p_label, '')), 30);
begin
  if not exists (select 1 from schools where roll = p_roll) then raise exception 'unknown school'; end if;
  select code into c from classes where roll = p_roll and year = p_year and lower(label) = lower(lbl);
  if c is not null then return c; end if;
  c := jq_create_class();
  begin
    update classes set roll = p_roll, year = p_year, label = lbl where code = c;
  exception when unique_violation then          -- another parent started it at the same moment
    delete from classes where code = c;
    select code into c from classes where roll = p_roll and year = p_year and lower(label) = lower(lbl);
  end;
  return c;
end $$;

-- The board now also says which school and year it is for.
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
    'info', (select jq_class_info(c.code) from c),
    'players', (select count(*) from players, c where players.class_code = c.code),
    'alltime', coalesce((select json_agg(x) from (select p.first_name || case when p.initial <> '' then ' ' || p.initial || '.' else '' end as name, b.ms, b.day
                 from best_all b join players p on p.id = b.player_id order by b.ms limit 3) x), '[]'::json),
    'week', coalesce((select json_agg(x) from (select p.first_name || case when p.initial <> '' then ' ' || p.initial || '.' else '' end as name, b.ms, b.day
                 from best_wk b join players p on p.id = b.player_id order by b.ms limit 3) x), '[]'::json));
$$;

revoke execute on function public.jq_school_list(text), public.jq_class_info(text), public.jq_school_class(text, text, text) from public, authenticated;
grant execute on function public.jq_school_list(text), public.jq_class_info(text), public.jq_school_class(text, text, text), public.jq_board(text) to anon;
grant execute on function public.jq_create_class() to anon;      -- kept for "My school isn't listed"

-- v2.1: attach a school to a class that was started before schools existed (keeps its members and times).
-- If that school + year board already exists, the members and their times move onto it.
create or replace function public.jq_set_class_school(p_code text, p_player uuid, p_roll text, p_year text, p_label text) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
        lbl text := left(trim(coalesce(p_label, '')), 30); existing text;
begin
  if not exists (select 1 from players where id = p_player and class_code = c) then raise exception 'not in class'; end if;
  if not exists (select 1 from schools where roll = p_roll) then raise exception 'unknown school'; end if;
  if exists (select 1 from classes where code = c and roll is not null) then raise exception 'already has a school'; end if;
  select code into existing from classes where roll = p_roll and year = p_year and lower(label) = lower(lbl);
  if existing is null then
    update classes set roll = p_roll, year = p_year, label = lbl where code = c;
    return c;
  end if;
  update speed_runs set class_code = existing where class_code = c;
  update players set class_code = existing, updated_at = now() where class_code = c;
  return existing;
end $$;
revoke execute on function public.jq_set_class_school(text, uuid, text, text, text) from public, authenticated;
grant execute on function public.jq_set_class_school(text, uuid, text, text, text) to anon;
