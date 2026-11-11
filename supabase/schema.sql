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
  role              text not null default 'employee' check (role in ('owner','manager','employee')),
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

-- Journal des accès (RGPD) — l'app y écrit push / pull_owner / pull_employee
create table if not exists access_log (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action            text not null,
  created_at        timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
--  ÉVOLUTIONS (colonnes ajoutées après la 1re version — idempotent)
--  `create table if not exists` n'ajoute pas de colonne à une table existante,
--  d'où ces `add column if not exists`. Rejouable sur base vide ou existante.
-- ─────────────────────────────────────────────────────────────────────────

-- local_id : identifiant côté app (localStorage). L'app synchronise par
-- upsert sur (establishment_id, local_id) → un index UNIQUE est obligatoire.
alter table employees add column if not exists local_id text;
alter table shifts    add column if not exists local_id text;
alter table absences  add column if not exists local_id text;
alter table notes     add column if not exists local_id text;
create unique index if not exists employees_est_local_uq on employees (establishment_id, local_id);
create unique index if not exists shifts_est_local_uq    on shifts    (establishment_id, local_id);
create unique index if not exists absences_est_local_uq  on absences  (establishment_id, local_id);
create unique index if not exists notes_est_local_uq     on notes     (establishment_id, local_id);

-- Contrat (2026-10-06) : droit à congés, heures saisies librement + unité, type de contrat
alter table employees add column if not exists conges_allowance numeric default 25;
alter table employees add column if not exists hours            numeric;
alter table employees add column if not exists hours_unit       text default 'semaine' check (hours_unit in ('semaine','mois'));
alter table employees add column if not exists contract_type    text;

-- Paie / export comptable (2026-11-02) : identité paie des employés, SIRET + règles de l'établissement,
-- heures d'une absence (types « paie » en heures), partagés entre admins/managers.
alter table employees add column if not exists matricule   text;
alter table employees add column if not exists first_name  text;   -- prénom (le nom complet reste dans `name`)
alter table employees add column if not exists last_name   text;   -- nom de famille
alter table employees add column if not exists job_title   text;
alter table employees add column if not exists start_date  date;
alter table employees add column if not exists end_date    date;
alter table employees add column if not exists mutuelle    boolean not null default false;
alter table employees add column if not exists base_salary numeric default 0;   -- SENSIBLE (admins seulement côté app)
alter table establishments add column if not exists siret text;
alter table establishments add column if not exists rules jsonb not null default '{}';   -- pauses, repas, nuit, dimanche, panier, paie
alter table absences add column if not exists hours numeric;                            -- null = journée contrat moyenne

-- Accès & rôles (2026-10-21) : un code d'invitation peut aussi donner le rôle admin ('owner')
alter table invite_codes drop constraint if exists invite_codes_role_check;
alter table invite_codes add constraint invite_codes_role_check check (role in ('owner','manager','employee'));

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

-- establishments : les membres lisent ; les ADMINS (rôle 'owner', plusieurs possibles) font tout ;
-- les managers peuvent mettre à jour les réglages (équipes, créneaux, règles, nom, logo) — c'est
-- ce qui fait que leurs modifications se synchronisent. owner_id = créateur, informatif.
drop policy if exists est_select on establishments;
create policy est_select on establishments for select using (is_member(id));
drop policy if exists est_owner_all on establishments;
drop policy if exists est_admin_all on establishments;
create policy est_admin_all on establishments for all using (is_owner(id)) with check (is_owner(id));
drop policy if exists est_staff_update on establishments;
create policy est_staff_update on establishments for update using (is_staff(id)) with check (is_staff(id));

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

-- invite_codes : patron/manager seulement. Un manager ne peut créer que des codes EMPLOYÉ ;
-- les codes manager/admin sont réservés aux admins (sinon un manager pourrait s'auto-promouvoir).
drop policy if exists inv_staff_all on invite_codes;
create policy inv_staff_all on invite_codes for all using (is_staff(establishment_id))
  with check (is_staff(establishment_id) and (role = 'employee' or is_owner(establishment_id)));

-- day_off_requests : l'employé crée/voit les siennes ; le staff voit/gère toutes
drop policy if exists off_emp_insert on day_off_requests;
create policy off_emp_insert on day_off_requests for insert with check (is_member(establishment_id));
drop policy if exists off_select on day_off_requests;
create policy off_select on day_off_requests for select using (
  is_staff(establishment_id) or employee_id = (select employee_id from memberships where establishment_id = day_off_requests.establishment_id and user_id = auth.uid())
);
drop policy if exists off_staff_update on day_off_requests;
create policy off_staff_update on day_off_requests for update using (is_staff(establishment_id)) with check (is_staff(establishment_id));

-- access_log : chaque membre peut journaliser ses propres accès ; seul le staff lit
alter table access_log enable row level security;
drop policy if exists log_member_insert on access_log;
create policy log_member_insert on access_log for insert
  with check (is_member(establishment_id) and user_id = auth.uid());
drop policy if exists log_staff_select on access_log;
create policy log_staff_select on access_log for select
  using (is_staff(establishment_id));

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

-- ─────────────────────────────────────────────────────────────────────────
--  ACCÈS & RÔLES (2026-10-21) — écran « Accès » de l'app
--  Rôles : 'owner' = Admin (plusieurs possibles) · 'manager' · 'employee'
-- ─────────────────────────────────────────────────────────────────────────

-- Liste des membres d'un établissement (avec e-mail) — staff uniquement.
create or replace function list_members(est uuid)
returns table (user_id uuid, email text, role text, employee_id uuid, employee_name text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.role, m.employee_id, e.name, m.created_at
  from memberships m
  join auth.users u on u.id = m.user_id
  left join employees e on e.id = m.employee_id
  where m.establishment_id = est and is_staff(est)
  order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, u.email
$$;
grant execute on function list_members(uuid) to authenticated;

-- Changer le rôle d'un membre — admin uniquement ; on ne peut jamais retirer le dernier admin.
create or replace function set_member_role(est uuid, target uuid, new_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_admins int; cur text;
begin
  if not is_owner(est) then return jsonb_build_object('ok', false, 'error', 'Réservé aux admins.'); end if;
  if new_role not in ('owner','manager','employee') then return jsonb_build_object('ok', false, 'error', 'Rôle inconnu.'); end if;
  select role into cur from memberships where establishment_id = est and user_id = target;
  if cur is null then return jsonb_build_object('ok', false, 'error', 'Membre introuvable.'); end if;
  if cur = 'owner' and new_role <> 'owner' then
    select count(*) into n_admins from memberships where establishment_id = est and role = 'owner';
    if n_admins <= 1 then return jsonb_build_object('ok', false, 'error', 'Impossible : il faut garder au moins un admin.'); end if;
  end if;
  update memberships set role = new_role where establishment_id = est and user_id = target;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function set_member_role(uuid, uuid, text) to authenticated;

-- Retirer l'accès d'un membre — admin uniquement ; jamais le dernier admin. La fiche employé reste.
create or replace function remove_member(est uuid, target uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_admins int; cur text;
begin
  if not is_owner(est) then return jsonb_build_object('ok', false, 'error', 'Réservé aux admins.'); end if;
  select role into cur from memberships where establishment_id = est and user_id = target;
  if cur is null then return jsonb_build_object('ok', false, 'error', 'Membre introuvable.'); end if;
  if cur = 'owner' then
    select count(*) into n_admins from memberships where establishment_id = est and role = 'owner';
    if n_admins <= 1 then return jsonb_build_object('ok', false, 'error', 'Impossible : il faut garder au moins un admin.'); end if;
  end if;
  delete from memberships where establishment_id = est and user_id = target;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function remove_member(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
--  SUPPRESSION DE COMPTE in-app (exigence Apple) — bouton « Supprimer mon compte »
--  Si l'utilisateur est le DERNIER admin d'un établissement, l'établissement part
--  avec lui (cascade). S'il reste un autre admin, l'établissement lui est transféré.
--  (Manquait dans ce fichier jusqu'au 2026-10-21 → était absent du projet recréé.)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); e record; other uuid;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  for e in select id from establishments where owner_id = me loop
    select m.user_id into other from memberships m
      where m.establishment_id = e.id and m.role = 'owner' and m.user_id <> me limit 1;
    if other is null then
      delete from establishments where id = e.id;          -- dernier admin : tout est supprimé (cascade)
    else
      update establishments set owner_id = other where id = e.id;   -- un autre admin reprend
    end if;
  end loop;
  delete from memberships where user_id = me;
  delete from auth.users where id = me;
end;
$$;
grant execute on function delete_account() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
--  OPLAA PRO : CODES GRATUITS (« code maison », 2026-10-26)
--  Un code (ex. BIVOUAK) offre Oplaa Pro à un établissement pour N mois, ou à vie
--  (months = null). Les codes se créent dans le Table Editor (table licence_codes) ;
--  ils ne sont JAMAIS lisibles par l'app (aucune politique de lecture) : la saisie
--  passe par la fonction redeem_licence, qui vérifie tout côté serveur.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists licence_codes (
  code        text primary key,                       -- saisi en MAJUSCULES, sans espaces
  label       text,                                   -- mémo interne (« partenaires », « testeurs »…)
  months      int,                                    -- null = à vie
  max_uses    int  not null default 1,
  uses        int  not null default 0,
  expires_at  timestamptz,                            -- date limite pour UTILISER le code (optionnel)
  created_at  timestamptz not null default now()
);
alter table licence_codes enable row level security;  -- aucune politique → invisible aux clients

alter table establishments add column if not exists pro_until  timestamptz;   -- null = pas Pro ; 'infinity' = à vie
alter table establishments add column if not exists pro_source text;          -- 'code:BIVOUAK' | 'apple'

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
  update establishments set pro_until = nouveau, pro_source = 'code:' || c.code where id = est;
  update licence_codes set uses = uses + 1 where code = c.code;
  return jsonb_build_object('ok', true, 'pro_until', nouveau, 'months', c.months);
end;
$$;
grant execute on function redeem_licence(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
--  PRIMES / AVANCES (vague 1, 2026-11) — par employé et par mois, données de salaire : ADMINS seulement
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists pay_items (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references establishments(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,
  local_id          text,
  month             text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),   -- 'YYYY-MM'
  code              text not null,                                          -- prime_exceptionnelle | prime_transport | prime_blanchissage | avance | autre
  label             text,
  amount            numeric(10,2) not null default 0,
  created_at        timestamptz not null default now()
);
create unique index if not exists pay_items_est_local_uq on pay_items (establishment_id, local_id);
create index if not exists pay_items_est_month_idx on pay_items (establishment_id, month);
alter table pay_items enable row level security;
drop policy if exists pay_items_admin_all on pay_items;
create policy pay_items_admin_all on pay_items for all using (is_owner(establishment_id)) with check (is_owner(establishment_id));

-- ─────────────────────────────────────────────────────────────────────────
--  TEMPS RÉEL (Supabase Realtime) — tables écoutées par l'app via
--  postgres_changes avec le filtre `establishment_id=eq.<id>` :
--    admin/manager  : day_off_requests (demandes en direct) + shifts/absences/notes/employees/establishments (co-édition)
--    employé        : shifts, absences, notes (son planning se met à jour seul)
--  Idempotent : ré-exécutable sans erreur.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['shifts','absences','notes','day_off_requests','employees','establishments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- REPLICA IDENTITY FULL : indispensable pour que les événements UPDATE/DELETE
-- portent la colonne establishment_id (sinon le filtre ne matche pas et, p. ex.,
-- un service supprimé par le patron n'est jamais répercuté chez l'employé).
alter table shifts           replica identity full;
alter table absences         replica identity full;
alter table notes            replica identity full;
alter table day_off_requests replica identity full;
alter table employees        replica identity full;   -- co-édition : l'équipe aussi

-- ============================================================================
--  FIN DU SCHÉMA. L'app est branchée (www/supabase-config.js : URL + clé
--  anon/publishable uniquement — jamais la clé service_role).
-- ============================================================================
