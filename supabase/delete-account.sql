-- Oplaa — suppression de compte in-app (exigée par Apple, guideline 5.1.1(v))
-- L'utilisateur connecté peut supprimer lui-même son compte + ses données.
create or replace function delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- 1) Établissements dont l'utilisateur est propriétaire
  --    (cascade : employees, shifts, absences, notes, timesheets, invite_codes, memberships de ces établissements)
  delete from establishments where owner_id = uid;

  -- 2) Appartenances restantes (établissements d'autres patrons où il était employé/manager)
  delete from memberships where user_id = uid;

  -- 3) Codes d'invitation créés par lui ailleurs, et références "utilisé par lui"
  delete from invite_codes where created_by = uid;
  update invite_codes set used_by = null, used_at = null where used_by = uid;

  -- 4) Le compte d'authentification lui-même
  delete from auth.users where id = uid;
end;
$$;

grant execute on function delete_account() to authenticated;
