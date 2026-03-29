alter table public.documents
  add column if not exists starred boolean not null default false,
  add column if not exists photo_notes text;
