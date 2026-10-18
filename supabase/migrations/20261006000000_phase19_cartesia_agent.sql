-- Phase 19: each client's own Cartesia agent (2026-10-06).
--
-- Staff link it in /admin. Outbound calls use it instead of the shared CARTESIA_AGENT_ID,
-- and inbound calls to it are saved under this client. One agent serves one client, so
-- another client's calls can never run it.

alter table public.ai_employees add column if not exists cartesia_agent_id text unique;
