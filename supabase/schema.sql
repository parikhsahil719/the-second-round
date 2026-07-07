-- The Second Round: scout accounts schema (Supabase free tier)
-- Run in the Supabase SQL editor of a new project, then set
-- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the web app.
-- Auth: enable Email provider (magic link) in Authentication settings.

create table if not exists scout_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  slug text not null,
  note_text text not null check (char_length(note_text) <= 2000),
  traits jsonb not null default '[]',
  comps jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Existing projects (added after initial deploy): run this one line to add comps.
-- alter table scout_notes add column if not exists comps jsonb not null default '[]';

create index if not exists scout_notes_user_slug on scout_notes (user_id, slug);

-- Private books: every scout sees only their own notes.
alter table scout_notes enable row level security;

create policy "own notes select" on scout_notes
  for select using (auth.uid() = user_id);
create policy "own notes insert" on scout_notes
  for insert with check (auth.uid() = user_id);
create policy "own notes delete" on scout_notes
  for delete using (auth.uid() = user_id);

-- Usernames: chosen at signup, immutable for now. The table (not the UI) enforces
-- the rules: unique regardless of case, 2-32 chars, letters/digits/dot/underscore/
-- hyphen. Immutability is the deliberate ABSENCE of an update policy under RLS.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-zA-Z0-9._-]{2,32}$'),
  created_at timestamptz not null default now()
);

-- "Sahil" and "sahil" are the same name
create unique index if not exists profiles_username_lower on profiles (lower(username));

alter table profiles enable row level security;

create policy "own profile select" on profiles
  for select using (auth.uid() = user_id);
create policy "own profile insert" on profiles
  for insert with check (auth.uid() = user_id);
-- no update policy: usernames can't be changed (yet)
-- no delete policy: the row dies with the account via the cascade

-- Signup can't insert the profile row itself (with email confirmation on, there is
-- no session until the user confirms), so a trigger copies the username out of the
-- signup metadata. Collisions get a short random suffix instead of failing signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base text;
  candidate text;
begin
  base := coalesce(
    nullif(regexp_replace(new.raw_user_meta_data->>'username', '[^a-zA-Z0-9._-]', '', 'g'), ''),
    'scout');
  candidate := left(base, 32);
  if char_length(candidate) < 2 then
    candidate := candidate || '_' || left(md5(random()::text), 4);
  end if;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    candidate := left(base, 26) || '_' || left(md5(random()::text), 4);
  end loop;
  insert into public.profiles (user_id, username) values (new.id, candidate);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Sign-in accepts a username in place of an email; this resolves one to the other
-- (case-insensitive). Security definer because profiles are otherwise owner-only.
-- Callable ONLY by the service role: the API does the resolution server-side, so a
-- browser can never turn someone's username into their email (the same posture as
-- any modern login system).
create or replace function public.email_for_username(uname text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.user_id = u.id
  where lower(p.username) = lower(uname);
$$;

revoke all on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;

-- Existing projects: paste everything from "create table if not exists profiles"
-- down to here into the SQL editor once. Accounts created before this have no
-- profile row; the app falls back to the email prefix for them.
--
-- Projects that ran the FIRST profiles version (3-20 chars, underscore only,
-- case-sensitive unique): run these three lines, then re-run the function block
-- above to pick up the new trigger logic.
-- alter table profiles drop constraint profiles_username_check;
-- alter table profiles add constraint profiles_username_check
--   check (username ~ '^[a-zA-Z0-9._-]{2,32}$');
-- create unique index if not exists profiles_username_lower on profiles (lower(username));
