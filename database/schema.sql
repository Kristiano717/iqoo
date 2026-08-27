-- Second Coworker — Supabase schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Matches the schema locked in CLAUDE.md exactly — do not add columns here
-- without updating that doc first.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  transcript text not null,
  -- Nullable: a session row is created at "save works" (Milestone 2) with
  -- the transcript only; summary is filled in later by Milestone 4's LLM call.
  summary text,
  "timestamp" timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  text text not null,
  "timestamp" timestamptz not null default now()
);

-- Recall (Milestone 5) retrieves past sessions by recency — no vector
-- search per CLAUDE.md, so a plain index on timestamp is all this needs.
create index if not exists sessions_timestamp_idx on sessions ("timestamp" desc);
create index if not exists tasks_session_id_idx on tasks (session_id);
