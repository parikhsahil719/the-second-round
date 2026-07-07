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
