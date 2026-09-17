-- Oplaa — patch synchro : relie les données locales (local_id) au cloud
alter table employees add column if not exists local_id text;
alter table shifts    add column if not exists local_id text;
alter table absences  add column if not exists local_id text;
alter table notes     add column if not exists local_id text;
create unique index if not exists employees_est_local on employees(establishment_id, local_id);
create unique index if not exists shifts_est_local    on shifts(establishment_id, local_id);
create unique index if not exists absences_est_local  on absences(establishment_id, local_id);
create unique index if not exists notes_est_local     on notes(establishment_id, local_id);
