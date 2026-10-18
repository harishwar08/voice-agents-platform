-- Phase 11: how each AI employee sounds and behaves on a call (voice, speed,
-- languages, nudges, voicemail...). Stored in our own provider-neutral shape so
-- the settings survive a change of voice platform; each provider adapter maps
-- what it supports. Missing keys fall back to defaults in agent-settings.ts.

alter table public.ai_employees
  add column if not exists agent_settings jsonb not null default '{}'::jsonb;
