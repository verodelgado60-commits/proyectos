-- =====================================================================
--  Administración de usuarios: sin registro público.
--  La administradora crea, desactiva y restablece cuentas desde la app
--  (a través de la función segura "admin-users").
-- =====================================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists disabled boolean not null default false;

-- Un usuario normal solo puede cambiar su nombre visible y su color,
-- y marcar que ya cambió su contraseña temporal. Nada más.
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id <> old.id or new.username <> old.username
       or new.is_admin <> old.is_admin or new.disabled <> old.disabled then
      raise exception 'No tienes permiso para cambiar ese dato';
    end if;
    if new.must_change_password and not old.must_change_password then
      raise exception 'No tienes permiso para cambiar ese dato';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_profile_update on public.profiles;
create trigger on_profile_update before update on public.profiles
  for each row execute function public.guard_profile();

-- Un usuario desactivado pierde el acceso a todos los proyectos de inmediato
create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m join profiles pr on pr.id = m.user_id
                 where m.project_id = p and m.user_id = auth.uid() and not pr.disabled);
$$;

create or replace function public.can_edit(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m join profiles pr on pr.id = m.user_id
                 where m.project_id = p and m.user_id = auth.uid() and not pr.disabled
                   and m.role in ('owner', 'editor'));
$$;

create or replace function public.is_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members m join profiles pr on pr.id = m.user_id
                 where m.project_id = p and m.user_id = auth.uid() and not pr.disabled
                   and m.role = 'owner');
$$;

-- find_profile no devuelve usuarios desactivados
create or replace function public.find_profile(u text)
returns table (id uuid, username text, full_name text, avatar_color text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_color
  from profiles p
  where auth.uid() is not null and not p.disabled and p.username = lower(trim(u));
$$;
revoke execute on function public.find_profile(text) from anon, public;
grant execute on function public.find_profile(text) to authenticated;

-- Los usuarios desactivados no pueden crear proyectos
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid()
              and exists (select 1 from public.profiles where id = auth.uid() and not disabled));
