-- Phase 10: prepaid credits. Each business has a rupee balance; connected
-- calls are charged per started minute, ring time and unanswered calls are free.
-- Amounts are integer paise so sums never drift.

alter table public.businesses
  add column if not exists rate_per_minute_paise integer not null default 300
    check (rate_per_minute_paise >= 0);

alter table public.call_attempts
  add column if not exists billed_minutes integer,
  add column if not exists charge_paise integer;

-- Append-only: the balance is the sum, so history can always be audited.
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('topup', 'call_charge', 'adjustment')),
  -- Positive adds credit, negative spends it.
  amount_paise integer not null,
  -- One charge per call, however many times Sarvam redelivers its webhook.
  call_attempt_id uuid unique references public.call_attempts (id) on delete set null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_business_created_idx
  on public.credit_ledger (business_id, created_at desc);

create or replace view public.business_balances
with (security_invoker = true) as
select b.id as business_id, coalesce(sum(l.amount_paise), 0)::bigint as balance_paise
from public.businesses b
left join public.credit_ledger l on l.business_id = b.id
group by b.id;

alter table public.credit_ledger enable row level security;

create policy "Members read credit ledger"
  on public.credit_ledger for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

-- Owners cannot write: credit only changes through payments, staff or call charges.
create policy "Platform staff manage credit ledger"
  on public.credit_ledger for all
  using (public.is_platform_staff())
  with check (public.is_platform_staff());
