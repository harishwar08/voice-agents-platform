-- Phase 9: bulk outbound campaigns. An owner uploads a contact list; a
-- scheduler works through it inside calling hours, a few calls at a time,
-- retrying unanswered numbers. Each contact becomes a normal lead, so calls,
-- analysis, captured fields and result delivery all work unchanged.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ai_employee_id uuid references public.ai_employees (id) on delete set null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'running', 'paused', 'completed')),
  max_concurrent integer not null default 3 check (max_concurrent between 1 and 20),
  -- Local wall-clock window in time_zone. TRAI limits telemarketing to 09:00-21:00.
  window_start time not null default '10:00' check (window_start >= '09:00'),
  window_end time not null default '19:00' check (window_end <= '21:00' and window_end > window_start),
  time_zone text not null default 'Asia/Kolkata',
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  retry_after_minutes integer not null default 120 check (retry_after_minutes between 15 and 1440),
  created_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaigns_business_id_idx on public.campaigns (business_id);
create index if not exists campaigns_running_idx on public.campaigns (status) where status = 'running';

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create table if not exists public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  phone text not null,
  notes text,
  status text not null default 'queued'
    check (status in ('queued', 'calling', 'completed', 'unreachable', 'failed', 'do_not_call')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  -- Set on the first attempt; retries add call_attempts to the same lead.
  lead_id uuid references public.leads (id) on delete set null,
  last_call_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone)
);

create index if not exists campaign_contacts_due_idx
  on public.campaign_contacts (campaign_id, next_attempt_at)
  where status = 'queued';
create index if not exists campaign_contacts_lead_id_idx on public.campaign_contacts (lead_id);

create trigger campaign_contacts_set_updated_at
  before update on public.campaign_contacts
  for each row execute function public.set_updated_at();

-- Numbers a business must never call from a campaign, whatever list they appear on.
create table if not exists public.do_not_call (
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (business_id, phone)
);

alter table public.campaigns enable row level security;
alter table public.campaign_contacts enable row level security;
alter table public.do_not_call enable row level security;

create policy "Members read campaigns"
  on public.campaigns for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Owners manage campaigns"
  on public.campaigns for all
  using (public.is_business_owner(business_id) or public.is_platform_staff())
  with check (public.is_business_owner(business_id) or public.is_platform_staff());

create policy "Members read campaign contacts"
  on public.campaign_contacts for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Members read do-not-call list"
  on public.do_not_call for select
  using (public.is_business_member(business_id) or public.is_platform_staff());

create policy "Owners manage do-not-call list"
  on public.do_not_call for all
  using (public.is_business_owner(business_id) or public.is_platform_staff())
  with check (public.is_business_owner(business_id) or public.is_platform_staff());
