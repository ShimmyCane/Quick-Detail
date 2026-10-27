-- DRAFT. Not applied to any project. Review before running.
--
-- Where the sketch data would live in the Supabase "Architecture" project (xabgankckrcuhcgdolrg).
-- Today the app keeps everything in the browser (IndexedDB, database "wallsketch"). This file is the
-- next step if you want the details in Supabase: one table of details, one of recordings, and audio in Storage.
--
-- The project already has projects, intake_answers, proposals, fee_milestones and lessons_learned (all empty).
-- project_id below links a detail to one of those projects. It is optional, so a detail can stand alone.
--
-- Every table has RLS on, like the existing ones, so no one can read or write until policies are added.
-- The policies below are a placeholder that lets only signed-in users in. Adjust them to how you sign in.

create table if not exists public.sketch_details (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  parent_id uuid references public.sketch_details(id) on delete set null,
  name text not null,
  scale text not null default '3"=1''-0"',
  tags text[] not null default '{}',
  items jsonb not null default '[]'::jsonb,      -- the sheet: strokes, notes, dimensions, with their meta tags
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sketch_recordings (
  id uuid primary key default gen_random_uuid(),
  detail_id uuid not null references public.sketch_details(id) on delete cascade,
  recorded_at timestamptz not null,
  duration_ms integer not null,
  scale text,
  base jsonb not null default '[]'::jsonb,       -- the sheet when the recording started
  events jsonb not null default '[]'::jsonb,     -- strokes, edits, marks, with times
  speech jsonb not null default '[]'::jsonb,     -- transcript lines with times
  voice jsonb not null default '[]'::jsonb,      -- [start, end] ms of talking
  audio_offset_ms integer not null default 0,
  audio_path text,                               -- path in the sketch-audio bucket, when uploaded
  created_at timestamptz not null default now()
);

create index if not exists sketch_recordings_detail_idx on public.sketch_recordings (detail_id, recorded_at);

alter table public.sketch_details enable row level security;
alter table public.sketch_recordings enable row level security;

create policy "signed in users read sketch details"
  on public.sketch_details for select to authenticated using (true);
create policy "signed in users write sketch details"
  on public.sketch_details for all to authenticated using (true) with check (true);
create policy "signed in users read sketch recordings"
  on public.sketch_recordings for select to authenticated using (true);
create policy "signed in users write sketch recordings"
  on public.sketch_recordings for all to authenticated using (true) with check (true);

-- Audio files. Private bucket; the app reads them with signed URLs.
insert into storage.buckets (id, name, public) values ('sketch-audio', 'sketch-audio', false)
  on conflict (id) do nothing;
