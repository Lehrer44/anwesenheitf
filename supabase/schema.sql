create table public.courses (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid unique references auth.users(id) on delete restrict,
 claim_hash text,
 state jsonb not null check (jsonb_typeof(state) = 'object'),
 version bigint not null default 0 check (version >= 0),
 created_at timestamptz not null default now(),
 constraint course_claim_owner check ((owner_id is not null and claim_hash is null) or (owner_id is null and claim_hash is not null))
);
alter table public.courses enable row level security;
revoke all on public.courses from anon, authenticated;
grant select on public.courses to authenticated;
grant select, insert, update, delete on public.courses to service_role;
create policy "owner_reads_own_course" on public.courses for select to authenticated using ((select auth.uid()) = owner_id);
comment on table public.courses is 'Writes only via the authorized course Edge Function. Group access is limited server-side by group token.';
