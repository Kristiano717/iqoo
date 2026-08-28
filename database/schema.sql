-- Second Coworker — Supabase schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Don't add columns here without updating CLAUDE.md's schema section too.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  transcript text not null,
  -- Nullable: a session row is created at "save works" (Milestone 2) with
  -- the transcript only; summary is filled in later by Milestone 4's LLM call.
  summary text,
  -- DEVIATION from CLAUDE.md's locked schema, added deliberately with
  -- sign-off: the spec's sessions table has no home for the `facts` array
  -- the extraction call returns. Folding facts into the summary text works
  -- but throws away their structure, which is exactly the product
  -- differentiator ("structured memory objects, not raw text"). Stored as
  -- jsonb array of strings.
  facts jsonb not null default '[]'::jsonb,
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

-- Migration for projects created before the facts column existed. Safe to
-- re-run; no-ops if the column is already there.
alter table sessions add column if not exists facts jsonb not null default '[]'::jsonb;
