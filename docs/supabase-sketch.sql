-- APPLIED to the Architecture project (xabgankckrcuhcgdolrg) as migration "sketch_tables_and_table_index".
-- This file is the record of it. Change the database with a new migration, then update this file.
--
-- Tables this app uses (claimed in public.table_index):
--   sketch_details     one row per drawing: name, scale, tags, the sheet items, the metadata summary
--   sketch_recordings  one row per recording: strokes, edits, speech, voice spans, and the audio path
--   sketch_snapshots   one row per scene: its words, its times, its JPEG path, its scene metadata
-- Media lives in the private bucket "sketch-media": audio, scene JPEGs and metadata.json, under <detail>/<recording>/.
--
-- Access: owner only, the same rule the practice tables use (the signed-in email must be the owner's).

create table if not exists public.table_index (
  table_name text primary key,
  project text not null,
  purpose text not null,
  created_at timestamptz not null default now()
);

alter table public.table_index enable row level security;

create policy "owner full access" on public.table_index for all to authenticated
  using ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com');

create table if not exists public.sketch_details (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  project_id uuid references public.projects(id) on delete set null,
  parent_id uuid references public.sketch_details(id) on delete set null,
  name text not null,
  scale text not null default '3"=1''-0"',
  tags text[] not null default '{}',
  items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sketch_recordings (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  detail_id uuid not null references public.sketch_details(id) on delete cascade,
  recorded_at timestamptz not null,
  duration_ms integer not null default 0,
  scale text,
  base jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  speech jsonb not null default '[]'::jsonb,
  voice jsonb not null default '[]'::jsonb,
  audio_offset_ms integer not null default 0,
  audio_path text,
  audio_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.sketch_snapshots (
  id uuid primary key default gen_random_uuid(),
  local_id text not null unique,
  recording_id uuid not null references public.sketch_recordings(id) on delete cascade,
  detail_id uuid not null references public.sketch_details(id) on delete cascade,
  scene_index integer not null,
  start_ms integer not null,
  end_ms integer not null,
  said text,
  image_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sketch_details_project_idx on public.sketch_details (project_id);
create index if not exists sketch_details_parent_idx on public.sketch_details (parent_id);
create index if not exists sketch_recordings_detail_idx on public.sketch_recordings (detail_id);
create index if not exists sketch_snapshots_recording_idx on public.sketch_snapshots (recording_id);
create index if not exists sketch_snapshots_detail_idx on public.sketch_snapshots (detail_id);

alter table public.sketch_details enable row level security;
alter table public.sketch_recordings enable row level security;
alter table public.sketch_snapshots enable row level security;

create policy "owner full access" on public.sketch_details for all to authenticated
  using ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com');
create policy "owner full access" on public.sketch_recordings for all to authenticated
  using ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com');
create policy "owner full access" on public.sketch_snapshots for all to authenticated
  using ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'splusystudio@gmail.com');

insert into storage.buckets (id, name, public, file_size_limit)
values ('sketch-media', 'sketch-media', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "owner reads sketch media" on storage.objects for select to authenticated
  using (bucket_id = 'sketch-media' and (auth.jwt() ->> 'email') = 'splusystudio@gmail.com');
create policy "owner writes sketch media" on storage.objects for insert to authenticated
  with check (bucket_id = 'sketch-media' and (auth.jwt() ->> 'email') = 'splusystudio@gmail.com');
create policy "owner updates sketch media" on storage.objects for update to authenticated
  using (bucket_id = 'sketch-media' and (auth.jwt() ->> 'email') = 'splusystudio@gmail.com');
create policy "owner deletes sketch media" on storage.objects for delete to authenticated
  using (bucket_id = 'sketch-media' and (auth.jwt() ->> 'email') = 'splusystudio@gmail.com');

insert into public.table_index (table_name, project, purpose) values
  ('projects', 'Architecture practice', 'Practice projects: client, site, archetype, status'),
  ('intake_answers', 'Architecture practice', 'Answers to the 20 intake questions, per project'),
  ('proposals', 'Architecture practice', 'Proposal versions per project'),
  ('fee_milestones', 'Architecture practice', 'Fee schedule milestones per project'),
  ('lessons_learned', 'Architecture practice', 'Observations and actions per project'),
  ('sketch_details', 'Quick Detail (wall sketch)', 'Drawings: name, scale, tags, sheet items, metadata'),
  ('sketch_recordings', 'Quick Detail (wall sketch)', 'Recordings of a drawing: strokes, speech, voice spans, audio'),
  ('sketch_snapshots', 'Quick Detail (wall sketch)', 'One picture and its metadata per scene'),
  ('table_index', 'Shared', 'This table: which project claims each table')
on conflict (table_name) do update set project = excluded.project, purpose = excluded.purpose;
