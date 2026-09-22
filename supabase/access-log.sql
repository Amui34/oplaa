-- Oplaa — journal des accès (RGPD : traçabilité de qui consulte/synchronise les données)
create table if not exists access_log (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action            text not null,               -- 'pull_owner' | 'pull_employee' | 'push'
  at                timestamptz not null default now()
);
create index if not exists access_log_est_at on access_log(establishment_id, at desc);

alter table access_log enable row level security;

-- Chaque membre peut écrire son propre accès (dans un établissement dont il est membre)
drop policy if exists access_log_insert on access_log;
create policy access_log_insert on access_log
  for insert to authenticated
  with check ( user_id = auth.uid() and is_member(establishment_id) );

-- Seuls patron/manager peuvent LIRE le journal de leur établissement
drop policy if exists access_log_select on access_log;
create policy access_log_select on access_log
  for select to authenticated
  using ( is_staff(establishment_id) );
