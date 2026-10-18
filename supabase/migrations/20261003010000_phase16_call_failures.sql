-- Phase 16: calls that never went out, so staff see them instead of a log line on a
-- server. A row is written whenever a lead's call could not be placed: the client was
-- out of call credits, or Sarvam refused it (wallet empty, agent or number problem,
-- bad keys). Only staff read it; the service role writes it.
--
-- call_attempts.dropped_variables records the values Sarvam's agent did not define and
-- the call went out without. business_description among them means the agent never
-- received the client's knowledge base.

create table if not exists public.call_failures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ai_employee_id uuid references public.ai_employees (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  reason text not null check (reason in ('no_credits', 'no_balance', 'agent', 'number', 'auth', 'settings', 'network', 'other')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists call_failures_created_at_idx on public.call_failures (created_at desc);
create index if not exists call_failures_business_id_idx on public.call_failures (business_id, created_at desc);

alter table public.call_failures enable row level security;

create policy "Staff read call failures"
  on public.call_failures for select
  using (public.is_platform_staff());

alter table public.call_attempts
  add column if not exists dropped_variables text[] not null default '{}';
