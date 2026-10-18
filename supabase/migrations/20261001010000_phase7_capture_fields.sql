-- Phase 7: owners choose what each call should find out (budget, area,
-- product...). Answers are extracted by our own call analysis, not the Sarvam
-- canvas, so adding a field never needs console work.

alter table public.ai_employees
  -- [{ "key": "budget", "label": "Budget", "type": "text", "hint": "..." }]
  add column if not exists capture_fields jsonb not null default '[]'::jsonb;

alter table public.call_attempts
  -- Stored with labels ([{ key, label, value }]) so renaming or removing a
  -- field later does not change what past calls show.
  add column if not exists captured jsonb not null default '[]'::jsonb;
