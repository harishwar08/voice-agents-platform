-- Phase 22: run the scheduler every minute from the database (2026-10-06).
--
-- /api/campaigns/tick places campaign calls and the callbacks customers ask for, so it has to
-- run every minute; Vercel's plan only allows a daily cron (vercel.json, kept as a fallback).
-- pg_cron calls it through pg_net with the same "Authorization: Bearer $CRON_SECRET" Vercel
-- Cron sends. The secret lives in Vault, never in this file, and is added once by hand:
--
--   select vault.create_secret('<CRON_SECRET from .env.local>', 'scheduler_cron_secret');
--
-- Vercel stores CRON_SECRET as a hidden value that can't be read back, so .env.local holds the
-- only readable copy; it must match production or every tick gets a 401. After rotating the
-- secret, update this one too: select vault.update_secret(id, '<new value>') with the id from
-- vault.secrets where name = 'scheduler_cron_secret'.
-- Until it exists the job finds no secret row and sends nothing.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Scheduling under an existing name replaces that job, so this is safe to run again.
select cron.schedule(
  'scheduler-tick',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://getaiemployee.vercel.app/api/campaigns/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || decrypted_secret),
    timeout_milliseconds := 55000
  )
  from vault.decrypted_secrets
  where name = 'scheduler_cron_secret';
  $$
);
