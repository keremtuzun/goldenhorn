-- Golden Horn 8159 scouting platform, database schema.
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It creates the tables, the row level security policies and the trigger that
-- gives every new account a profile.
--
-- The security model in one line: anyone signed in to your project can READ the
-- team's scouting data, but can only EDIT their own rows. That matches how a
-- scouting team actually works, where everyone needs the whole picture but
-- nobody should be able to quietly rewrite someone else's match.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null,
  role        text not null default 'Scout',
  team_group  text not null default 'MARMARA-A',
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by signed in users" on public.profiles;
create policy "profiles readable by signed in users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- New sign ups carry name/role/group in their user metadata. This copies it
-- into profiles so the leaderboard has something to show immediately.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role, team_group)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'Scout'),
    coalesce(new.raw_user_meta_data->>'team_group', 'MARMARA-A')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── match records ─────────────────────────
create table if not exists public.match_records (
  id          text primary key,              -- client generated, so offline writes keep their identity
  scout_id    uuid references auth.users on delete set null,
  scout_name  text,
  event       text not null,
  team        integer not null,
  match       text not null,
  alliance    text,
  tracked     integer,
  totals      jsonb  not null default '{}'::jsonb,
  spans       jsonb  not null default '[]'::jsonb,
  defense     integer,
  driver      integer,
  broke       boolean default false,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists match_records_event_team_idx on public.match_records (event, team);
create index if not exists match_records_scout_idx      on public.match_records (scout_id);

alter table public.match_records enable row level security;

drop policy if exists "matches readable by signed in users" on public.match_records;
create policy "matches readable by signed in users"
  on public.match_records for select to authenticated using (true);

drop policy if exists "insert own matches" on public.match_records;
create policy "insert own matches"
  on public.match_records for insert to authenticated with check (auth.uid() = scout_id);

drop policy if exists "update own matches" on public.match_records;
create policy "update own matches"
  on public.match_records for update to authenticated using (auth.uid() = scout_id);

drop policy if exists "delete own matches" on public.match_records;
create policy "delete own matches"
  on public.match_records for delete to authenticated using (auth.uid() = scout_id);

-- ───────────────────────── pit reports ─────────────────────────
-- One report per robot per event. Anyone can revise it, because a pit report is
-- a shared description of a robot rather than one person's observation.
create table if not exists public.pit_reports (
  id          text primary key,
  scout_id    uuid references auth.users on delete set null,
  scout_name  text,
  event       text not null,
  team        integer not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  unique (event, team)
);

create index if not exists pit_reports_event_idx on public.pit_reports (event);

alter table public.pit_reports enable row level security;

drop policy if exists "pits readable by signed in users" on public.pit_reports;
create policy "pits readable by signed in users"
  on public.pit_reports for select to authenticated using (true);

drop policy if exists "pits writable by signed in users" on public.pit_reports;
create policy "pits writable by signed in users"
  on public.pit_reports for insert to authenticated with check (true);

drop policy if exists "pits updatable by signed in users" on public.pit_reports;
create policy "pits updatable by signed in users"
  on public.pit_reports for update to authenticated using (true);

-- ───────────────────────── pick list ─────────────────────────
-- One shared list per event. Strategy changes it together, so last write wins
-- and updated_by records who touched it.
create table if not exists public.pick_lists (
  event       text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

alter table public.pick_lists enable row level security;

drop policy if exists "picks readable by signed in users" on public.pick_lists;
create policy "picks readable by signed in users"
  on public.pick_lists for select to authenticated using (true);

drop policy if exists "picks writable by signed in users" on public.pick_lists;
create policy "picks writable by signed in users"
  on public.pick_lists for insert to authenticated with check (true);

drop policy if exists "picks updatable by signed in users" on public.pick_lists;
create policy "picks updatable by signed in users"
  on public.pick_lists for update to authenticated using (true);

-- ───────────────────────── leaderboard ─────────────────────────
-- Tallies per scout, so the board is derived from the actual work rather than
-- from a counter anyone could edit.
create or replace view public.scout_board
with (security_invoker = on) as
select
  p.id,
  p.name,
  p.role,
  p.team_group,
  (select count(*) from public.match_records m where m.scout_id = p.id) as matches,
  (select count(*) from public.pit_reports  r where r.scout_id = p.id) as pits
from public.profiles p;
