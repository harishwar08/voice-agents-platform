-- Phase 13: each client's agent lives in Dograh. Staff build one agent per client
-- in Dograh and link it here when creating the client; null keeps the shared
-- default agent (DOGRAH_WORKFLOW_ID). The client's knowledge stays editable on
-- our platform and is copied into one Dograh knowledge document per employee,
-- whose id is kept here so later edits replace it rather than add another.

alter table public.ai_employees
  add column if not exists dograh_workflow_id integer,
  add column if not exists dograh_knowledge_uuid text;
