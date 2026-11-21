-- ============================================================================
--  Oplaa — correctifs de sécurité (audit du 22/11/2026)
--  Idempotent : peut être rejoué sans risque. À exécuter en entier dans le SQL Editor.
--  Le même contenu est intégré à supabase/schema.sql (source de vérité).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
--  [1] SALAIRES : sortis de `employees` (lisible par les managers) vers `employee_pay`,
--      réservée aux admins (comme pay_items). Les colonnes employees.rate / base_salary
--      restent pour la compatibilité des anciennes versions de l'app, mais sont TOUJOURS
--      vides : un trigger redirige ce qu'un admin y écrit vers employee_pay.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists employee_pay (
  employee_id       uuid primary key references employees(id) on delete cascade deferrable initially deferred,
  establishment_id  uuid not null references establishments(id) on delete cascade,
  rate              numeric,          -- taux horaire brut
  base_salary       numeric,          -- salaire de base mensuel brut
  updated_at        timestamptz not null default now()
);
create index if not exists employee_pay_est_idx on employee_pay (establishment_id);
alter table employee_pay enable row level security;
drop policy if exists employee_pay_admin_all on employee_pay;
create policy employee_pay_admin_all on employee_pay for all
  using (is_owner(establishment_id)) with check (is_owner(establishment_id));

-- Reprise des salaires existants (avant de vider les colonnes)
insert into employee_pay (employee_id, establishment_id, rate, base_salary)
  select id, establishment_id, nullif(rate, 0), nullif(base_salary, 0) from employees
  where coalesce(rate, 0) <> 0 or coalesce(base_salary, 0) <> 0
on conflict (employee_id) do nothing;

create or replace function employees_route_pay() returns trigger
language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if (coalesce(new.rate, 0) <> 0 or coalesce(new.base_salary, 0) <> 0) and is_owner(new.establishment_id) then
    eid := new.id;
    if tg_op = 'INSERT' and new.local_id is not null then   -- upsert : la ligne existe peut-être déjà
      select id into eid from employees where establishment_id = new.establishment_id and local_id = new.local_id;
      if eid is null then eid := new.id; end if;
    end if;
    insert into employee_pay (employee_id, establishment_id, rate, base_salary)
      values (eid, new.establishment_id, nullif(new.rate, 0), nullif(new.base_salary, 0))
    on conflict (employee_id) do update
      set rate = coalesce(excluded.rate, employee_pay.rate),
          base_salary = coalesce(excluded.base_salary, employee_pay.base_salary),
          updated_at = now();
  end if;
  new.rate := null;            -- jamais de salaire dans employees (lisible par les managers + temps réel)
  new.base_salary := null;
  return new;
end;
$$;
drop trigger if exists employees_route_pay on employees;
create trigger employees_route_pay before insert or update on employees
  for each row execute function employees_route_pay();

alter table employees alter column rate drop default;
alter table employees alter column base_salary drop default;
update employees set rate = null, base_salary = null where rate is not null or base_salary is not null;

-- ─────────────────────────────────────────────────────────────────────────
--  [2] + [6] CODES D'INVITATION
--   - un manager ne voit/gère que les codes EMPLOYÉ (plus les codes admin/manager) ;
--   - expiration forcée à 7 jours côté serveur, codes existants inutilisés compris ;
--   - rejoindre avec un code ne change JAMAIS le rôle d'un membre existant ;
--   - 10 essais ratés max par quart d'heure et par compte.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists inv_staff_all on invite_codes;
drop policy if exists inv_select on invite_codes;
drop policy if exists inv_insert on invite_codes;
drop policy if exists inv_update on invite_codes;
drop policy if exists inv_delete on invite_codes;
create policy inv_select on invite_codes for select
  using (is_owner(establishment_id) or (is_staff(establishment_id) and role = 'employee'));
create policy inv_insert on invite_codes for insert
  with check (is_staff(establishment_id) and (role = 'employee' or is_owner(establishment_id)));
create policy inv_update on invite_codes for update
  using (is_owner(establishment_id) or (is_staff(establishment_id) and role = 'employee'))
  with check (is_owner(establishment_id) or (is_staff(establishment_id) and role = 'employee'));
create policy inv_delete on invite_codes for delete
  using (is_owner(establishment_id) or (is_staff(establishment_id) and role = 'employee'));

create or replace function invite_codes_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.code := upper(regexp_replace(coalesce(new.code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(new.code) < 8 then raise exception 'Code d''invitation trop court'; end if;
  new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '7 days');
  new.used_by := null; new.used_at := null;
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;
drop trigger if exists invite_codes_defaults on invite_codes;
create trigger invite_codes_defaults before insert on invite_codes
  for each row execute function invite_codes_defaults();

update invite_codes set expires_at = now() + interval '7 days'
  where used_by is null and (expires_at is null or expires_at > now() + interval '7 days');

create table if not exists join_attempts (
  user_id  uuid not null references auth.users(id) on delete cascade,
  at       timestamptz not null default now()
);
create index if not exists join_attempts_user_at on join_attempts (user_id, at);
alter table join_attempts enable row level security;   -- aucune politique : invisible aux clients

create or replace function join_with_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv invite_codes; me uuid := auth.uid(); n int; ok boolean;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'Connexion requise.'); end if;
  select count(*) into n from join_attempts where user_id = me and at > now() - interval '15 minutes';
  if n >= 10 then return jsonb_build_object('ok', false, 'error', 'Trop d''essais. Réessaie dans 15 minutes.'); end if;
  select * into inv from invite_codes where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  ok := found;
  if not ok or inv.used_by is not null or (inv.expires_at is not null and inv.expires_at < now()) then
    insert into join_attempts (user_id) values (me);
    if not ok then return jsonb_build_object('ok', false, 'error', 'Code inconnu.'); end if;
    if inv.used_by is not null then return jsonb_build_object('ok', false, 'error', 'Code déjà utilisé.'); end if;
    return jsonb_build_object('ok', false, 'error', 'Code expiré. Demande un nouveau code.');
  end if;

  -- Déjà membre : rien ne change (un code ne peut ni promouvoir ni rétrograder) et le code reste disponible.
  if exists (select 1 from memberships where establishment_id = inv.establishment_id and user_id = me) then
    return jsonb_build_object('ok', true, 'establishment_id', inv.establishment_id, 'already', true,
      'role', (select role from memberships where establishment_id = inv.establishment_id and user_id = me));
  end if;
  insert into memberships (establishment_id, user_id, role, employee_id)
  values (inv.establishment_id, me, inv.role, inv.employee_id);

  update invite_codes set used_by = me, used_at = now() where id = inv.id;
  return jsonb_build_object('ok', true, 'establishment_id', inv.establishment_id,
    'role', (select role from memberships where establishment_id = inv.establishment_id and user_id = me));
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
--  [3] OPLAA PRO : pro_until / pro_source modifiables uniquement par le serveur
--      (code offert via redeem_licence, ou webhook RevenueCat avec la clé de service).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function guard_pro_columns() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('oplaa.pro_write', true), '') = '1' or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pro_until := null; new.pro_source := null;
  elsif new.pro_until is distinct from old.pro_until or new.pro_source is distinct from old.pro_source then
    new.pro_until := old.pro_until;      -- tentative ignorée, le reste de la mise à jour passe
    new.pro_source := old.pro_source;
  end if;
  return new;
end;
$$;
drop trigger if exists establishments_guard_pro on establishments;
create trigger establishments_guard_pro before insert or update on establishments
  for each row execute function guard_pro_columns();

create or replace function redeem_licence(est uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c licence_codes; cur timestamptz; base timestamptz; nouveau timestamptz;
begin
  if not is_owner(est) then return jsonb_build_object('ok', false, 'error', 'Réservé aux admins.'); end if;
  select * into c from licence_codes where code = upper(regexp_replace(coalesce(p_code,''), '\s', '', 'g'));
  if not found then return jsonb_build_object('ok', false, 'error', 'Code inconnu.'); end if;
  if c.expires_at is not null and c.expires_at < now() then return jsonb_build_object('ok', false, 'error', 'Ce code a expiré.'); end if;
  if c.uses >= c.max_uses then return jsonb_build_object('ok', false, 'error', 'Ce code a déjà été utilisé.'); end if;
  select pro_until into cur from establishments where id = est;
  if cur = 'infinity' then return jsonb_build_object('ok', false, 'error', 'Cet établissement a déjà Oplaa Pro à vie.'); end if;
  if c.months is null then nouveau := 'infinity';
  else base := greatest(coalesce(cur, now()), now()); nouveau := base + make_interval(months => c.months); end if;
  perform set_config('oplaa.pro_write', '1', true);   -- autorise l'écriture de pro_until pour cette transaction
  update establishments set pro_until = nouveau, pro_source = 'code:' || c.code where id = est;
  update licence_codes set uses = uses + 1 where code = c.code;
  return jsonb_build_object('ok', true, 'pro_until', nouveau, 'months', c.months);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
--  [4] SUPPRESSION DE COMPTE : les codes créés / utilisés ne bloquent plus
--      `delete from auth.users` (Apple 5.1.1(v), RGPD).
-- ─────────────────────────────────────────────────────────────────────────
alter table invite_codes alter column created_by drop not null;
alter table invite_codes drop constraint if exists invite_codes_created_by_fkey;
alter table invite_codes add constraint invite_codes_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table invite_codes drop constraint if exists invite_codes_used_by_fkey;
alter table invite_codes add constraint invite_codes_used_by_fkey
  foreign key (used_by) references auth.users(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────
--  [7] CONGÉS : un employé ne crée qu'une demande EN ATTENTE, à SON nom.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists off_emp_insert on day_off_requests;
create policy off_emp_insert on day_off_requests for insert with check (
  is_staff(establishment_id)
  or (
    is_member(establishment_id)
    and status = 'pending'
    and employee_id is not null
    and employee_id = (select m.employee_id from memberships m
                       where m.establishment_id = day_off_requests.establishment_id and m.user_id = auth.uid())
  )
);

-- ─────────────────────────────────────────────────────────────────────────
--  Réserve : aucune fonction exécutable sans être connecté (rôle anon).
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'my_role(uuid)','is_member(uuid)','is_staff(uuid)','is_owner(uuid)','join_with_code(text)',
    'create_establishment(text)','list_members(uuid)','set_member_role(uuid,uuid,text)',
    'remove_member(uuid,uuid)','delete_account()','redeem_licence(uuid,text)'
  ] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke execute on function public.%s from public, anon', f);
      execute format('grant execute on function public.%s to authenticated', f);
    end if;
  end loop;
end $$;
