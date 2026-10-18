-- Phase 23: campaign retries as soon as 5 minutes after an unanswered call
-- (was 15). The scheduler runs every minute, so a short wait is honoured.

alter table public.campaigns drop constraint if exists campaigns_retry_after_minutes_check;

alter table public.campaigns
  add constraint campaigns_retry_after_minutes_check
  check (retry_after_minutes between 5 and 1440);
