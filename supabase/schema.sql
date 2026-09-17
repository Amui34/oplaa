-- ============================================================================
--  Oplaa — Schéma Supabase (base de données + sécurité par rôle)
--  © 2026 Noa Madar
--
--  Modèle : chaque personne (patron, manager, employé) se crée un compte
--  (email + mot de passe via Supabase Auth), puis rejoint un établissement
--  en entrant le CODE d'invitation envoyé par le patron.
--
--  Rôles : 'owner' (patron) · 'manager' · 'employee'
--
--  À faire : copier-coller ce fichier dans Supabase → SQL Editor → Run.
--  Idempotent : peut être relancé sans casser (create if not exists / drop policy).
-- ============================================================================

create extension if not exists pgcrypto;   -- pour gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────
--  TABLES
-- ─────────────────────────────────────────────────────────────────────────

-- Établissement (un par restaurant/boutique/etc.)
create table if not exists establishments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null default 'Mon établissement',
  profile       text not null default 'restaurant',
  team_word     text not null default 'Équipe',
  accent        text not null default '#C4562F',
  logo          text,                       -- data URL (optionnel)
  emp_scope     text not null default 'all' check (emp_scope in ('team','all')),
  teams         jsonb not null default '[]',   -- [{key,label,color}]
  periods       jsonb not null default '[]',   -- [{key,label,start,end,accent}]
  compliance    jsonb not null default '[]',   -- [{key,label,type}]
  created_at    timestamptz not null default now()
);

-- Qui appartient à quel établissement, et avec quel rôle
create table if not exists memberships (
  id                  uuid primary key default gen_random_uuid(),
  establishment_id    uuid not null references establishments(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  role                text not null check (role in ('owner','manager','employee')),
  employee_id         uuid,                       -- lie un compte employé à sa fiche
  can_view_compliance boolean not null default false,  -- délégation Conformité à un manager
  created_at          timestamptz not null default now(),
  unique (establishment_id, user_id)
);

-- Fiches employés (données RH — sensibles : taux, email, tel, conformité)
create table if not exists employees (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  name              text not null,
  role              text,               -- clé d'équipe (salle, cuisine…)
  contract          text,
  rate              numeric default 0,  -- taux horaire (SENSIBLE)
  phone             text,
  email             text,
  archived          boolean not null default false,
  compliance        jsonb not null default '{}',  -- {key:{date}|{done}} (SENSIBLE)
  created_at        timestamptz not null default now()
);

-- Services (shifts)
create table if not exists shifts (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  employee_id       uuid references employees(id) on delete cascade,
  extra_name        text,               -- renfort au nom libre (si pas d'employee_id)
  week              date not null,      -- lundi de la semaine
  day               int  not null check (day between 0 and 6),
  team              text not null,
  period            text not null,
  start_t           text not null,      -- "HH:MM"
  end_t             text not null,
  real_start        text,
  real_end          text,
  breaks            jsonb not null default '[]',  -- [{type,min}]
  note              text,
  created_at        timestamptz not null default now()
);

-- Congés / absences
create table if not exists absences (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,
  week              date not null,
  day               int  not null check (day between 0 and 6),
  type              text not null,       -- conge|maladie|repos|indispo
  created_at        timestamptz not null default now()
);

-- Notes & événements
create table if not exists notes (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  week              date not null,
  day               int,                 -- null = toute la semaine
  text              text not null,
  level             text not null default 'info',
  created_at        timestamptz not null default now()
);

-- Feuilles d'heures validées + signatures
create table if not exists timesheets (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  week              date not null,
  validated_at      timestamptz,
  signatures        jsonb not null default '{}',  -- {employee_id:{at}}
  unique (establishment_id, week)
);

-- Codes d'invitation (le patron en génère, l'employé l'entre après inscription)
create table if not exists invite_codes (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  code              text not null unique,
  role              text not null default 'employee' check (role in ('manager','employee')),
  employee_id       uuid references employees(id) on delete set null,  -- lie à une fiche précise
  created_by        uuid not null references auth.users(id),
  used_by           uuid references auth.users(id),
  used_at           timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);

-- Demandes de repos (employé → patron)
create table if not exists day_off_requests (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  employee_id       uuid references employees(id) on delete cascade,
  details           text,
  status            text not null default 'pending' check (status in ('pending','approved','refused')),
  created_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
--  FONCTIONS D'AIDE (contrôle d'accès)
-- ─────────────────────────────────────────────────────────────────────────

-- Rôle de l'utilisateur courant dans un établissement (null s'il n'est pas membre)
create or replace function my_role(est uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from memberships where establishment_id = est and user_id = auth.uid()
$$;

create or replace function is_member(est uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships where establishment_id = est and user_id = auth.uid())
$$;

create or replace function is_staff(est uuid)   -- patron ou manager
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships where establishment_id = est and user_id = auth.uid() and role in ('owner','manager'))
$$;

create or replace function is_owner(est uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from memberships where establishment_id = est and user_id = auth.uid() and role = 'owner')
$$;

-- ─────────────────────────────────────────────────────────────────────────
--  RLS (Row Level Security) — chacun ne voit que ce à quoi il a droit
-- ─────────────────────────────────────────────────────────────────────────
alter table establishments   enable row level security;
alter table memberships      enable row level security;
alter table employees        enable row level security;
alter table shifts           enable row level security;
alter table absences         enable row level security;
alter table notes            enable row level security;
alter table timesheets       enable row level security;
alter table invite_codes     enable row level security;
alter table day_off_requests enable row level security;

-- establishments : les membres lisent ; seul le patron modifie
drop policy if exists est_select on establishments;
create policy est_select on establishments for select using (is_member(id));
drop policy if exists est_owner_all on establishments;
create policy est_owner_all on establishments for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- memberships : on voit les membres de ses établissements ; le patron gère
drop policy if exists mem_select on memberships;
create policy mem_select on memberships for select using (is_member(establishment_id));
drop policy if exists mem_staff_write on memberships;
create policy mem_staff_write on memberships for all using (is_owner(establishment_id)) with check (is_owner(establishment_id));

-- employees : SENSIBLE → patron/manager uniquement (les employés passent par la vue publique)
drop policy if exists emp_staff_all on employees;
create policy emp_staff_all on employees for all using (is_staff(establishment_id)) with check (is_staff(establishment_id));

-- shifts : tous les membres lisent (nécessaire pour « qui bosse avec moi ») ; staff écrit
drop policy if exists shift_select on shifts;
create policy shift_select on shifts for select using (is_member(establishment_id));
drop policy if exists shift_staff_write on shifts;
create policy shift_staff_write on shifts for all using (is_staff(establishment_id)) with check (is_staff(establishment_id));

-- absences : membres lisent ; staff écrit
drop policy if exists abs_select on absences;
create policy abs_select on absences for select using (is_member(establishment_id));
drop policy if exists abs_staff_write on absences;
create policy abs_staff_write on absences for all using (is_staff(establishment_id)) with check (is_staff(establishment_id));

-- notes : membres lisent ; staff écrit
drop policy if exists note_select on notes;
create policy note_select on notes for select using (is_member(establishment_id));
drop policy if exists note_staff_write on notes;
create policy note_staff_write on notes for all using (is_staff(establishment_id)) with check (is_staff(establishment_id));

-- timesheets : staff seulement (contient les heures validées + signatures)
drop policy if exists ts_staff_all on timesheets;
create policy ts_staff_all on timesheets for all using (is_staff(establishment_id)) with check (is_staff(establishment_id));
-- un employé peut lire la feuille de SA semaine pour signer (lecture seule)
drop policy if exists ts_emp_select on timesheets;
create policy ts_emp_select on timesheets for select using (is_member(establishment_id));

-- invite_codes : patron/manager seulement
drop policy if exists inv_staff_all on invite_codes;
create policy inv_staff_all on invite_codes for all using (is_staff(establishment_id)) with check (is_staff(establishment_id));

-- day_off_requests : l'employé crée/voit les siennes ; le staff voit/gère toutes
drop policy if exists off_emp_insert on day_off_requests;
create policy off_emp_insert on day_off_requests for insert with check (is_member(establishment_id));
drop policy if exists off_select on day_off_requests;
create policy off_select on day_off_requests for select using (
  is_staff(establishment_id) or employee_id = (select employee_id from memberships where establishment_id = day_off_requests.establishment_id and user_id = auth.uid())
);
drop policy if exists off_staff_update on day_off_requests;
create policy off_staff_update on day_off_requests for update using (is_staff(establishment_id)) with check (is_staff(establishment_id));

-- ─────────────────────────────────────────────────────────────────────────
--  VUE PUBLIQUE EMPLOYÉ — prénoms + équipe UNIQUEMENT (aucune donnée sensible)
--  C'est ce que voient les employés pour l'affichage « L'équipe ».
--  Pas de taux, pas d'email, pas de téléphone, pas de conformité.
-- ─────────────────────────────────────────────────────────────────────────
-- IMPORTANT : le WHERE is_member(...) limite la vue aux établissements DONT
-- l'utilisateur est membre → il ne voit jamais les employés des autres.
create or replace view team_members_public
with (security_invoker = false, security_barrier = true) as
  select id, establishment_id, name, role, archived
  from employees
  where is_member(establishment_id);

grant select on team_members_public to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
--  RPC : rejoindre un établissement avec un code (après inscription)
--  L'employé s'inscrit (Supabase Auth), puis appelle join_with_code('ABC123').
-- ─────────────────────────────────────────────────────────────────────────
create or replace function join_with_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inv invite_codes;
begin
  select * into inv from invite_codes where code = upper(trim(p_code));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Code inconnu.');
  end if;
  if inv.used_by is not null then
    return jsonb_build_object('ok', false, 'error', 'Code déjà utilisé.');
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Code expiré.');
  end if;

  insert into memberships (establishment_id, user_id, role, employee_id)
  values (inv.establishment_id, auth.uid(), inv.role, inv.employee_id)
  on conflict (establishment_id, user_id) do update set role = excluded.role, employee_id = excluded.employee_id;

  update invite_codes set used_by = auth.uid(), used_at = now() where id = inv.id;

  return jsonb_build_object('ok', true, 'establishment_id', inv.establishment_id, 'role', inv.role);
end;
$$;

grant execute on function join_with_code(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
--  RPC : créer un établissement (l'appelant devient patron)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function create_establishment(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare est_id uuid;
begin
  insert into establishments (owner_id, name) values (auth.uid(), coalesce(nullif(trim(p_name),''),'Mon établissement'))
  returning id into est_id;
  insert into memberships (establishment_id, user_id, role) values (est_id, auth.uid(), 'owner');
  return est_id;
end;
$$;

grant execute on function create_establishment(text) to authenticated;

-- ============================================================================
--  FIN. Prochaine étape : je branche l'app (client Supabase + écrans de
--  connexion) une fois que tu m'as donné l'URL du projet + la clé anon/public.
-- ============================================================================
