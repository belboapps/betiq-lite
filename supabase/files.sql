-- BetIQ Lite: a private place for the home server to leave the weekly prices file.
-- Paste this whole file into Supabase: SQL Editor > New query > Run. It is safe to run more than once.
-- The home server writes with its secret key; the app can only read your own row.

create table if not exists public.files (
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  body       text not null,
  fetched_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.files enable row level security;

drop policy if exists "files select own" on public.files;
create policy "files select own" on public.files for select to authenticated using (auth.uid() = user_id);

revoke all on public.files from anon;
revoke all on public.files from authenticated;
grant select on public.files to authenticated;
