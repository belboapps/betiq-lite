-- BetIQ Lite: cloud backup for your bets.
-- Paste this whole file into Supabase: SQL Editor > New query > Run. It is safe to run more than once.

create table if not exists public.bets (
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  pid        text    not null,                 -- the bet's id inside the app
  practice   boolean not null default false,   -- true for practice-mode bets
  m          bigint  not null,                 -- when the bet was last changed (milliseconds), used to decide which copy is newer
  data       jsonb   not null,                 -- the bet itself, or {"deleted": true}
  updated_at timestamptz not null default now(),
  primary key (user_id, pid, practice)
);

-- Row level security: every person can only ever see and change their own rows.
alter table public.bets enable row level security;

drop policy if exists "bets select own" on public.bets;
drop policy if exists "bets insert own" on public.bets;
drop policy if exists "bets update own" on public.bets;
drop policy if exists "bets delete own" on public.bets;

create policy "bets select own" on public.bets for select to authenticated using (auth.uid() = user_id);
create policy "bets insert own" on public.bets for insert to authenticated with check (auth.uid() = user_id);
create policy "bets update own" on public.bets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bets delete own" on public.bets for delete to authenticated using (auth.uid() = user_id);

-- Visitors who are not signed in get nothing at all.
revoke all on public.bets from anon;
grant select, insert, update, delete on public.bets to authenticated;
