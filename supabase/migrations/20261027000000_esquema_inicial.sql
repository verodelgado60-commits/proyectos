-- =====================================================================
--  Gestor de proyectos (estilo Monday) — Esquema de base de datos
--  Ejecutar UNA vez en Supabase → SQL Editor → New query → Run
--  Seguridad: Row Level Security (RLS) en todas las tablas.
--  Las contraseñas NO se guardan aquí: Supabase Auth las almacena
--  con hash bcrypt en el esquema interno auth.
-- =====================================================================

-- ---------- Tipos ----------
do $$ begin
  create type public.member_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

-- ---------- Tablas ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null check (username ~ '^[a-z0-9_.-]{3,30}$'),
  full_name   text not null default '' check (char_length(full_name) <= 80),
  avatar_color text not null default '#579bfc',
  created_at  timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  color       text not null default '#579bfc',
  owner_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.member_role not null default 'editor',
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Grupos / secciones de un proyecto (ej. "Fase A", "Fase B")
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  color       text not null default '#579bfc',
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

-- Etiquetas editables de estado y prioridad, por proyecto
create table if not exists public.labels (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  kind        text not null check (kind in ('status', 'priority')),
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default '#c4c4c4',
  position    double precision not null default 0,
  is_done     boolean not null default false
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  parent_id   uuid references public.tasks(id) on delete cascade,   -- subtareas
  title       text not null check (char_length(title) between 1 and 300),
  description text not null default '' check (char_length(description) <= 10000),
  status_id   uuid references public.labels(id) on delete set null,
  priority_id uuid references public.labels(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  start_date  date,
  due_date    date,
  estimation  numeric check (estimation is null or estimation >= 0),
  position    double precision not null default 0,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (start_date is null or due_date is null or start_date <= due_date)
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Índices ----------
create index if not exists idx_members_user   on public.project_members(user_id);
create index if not exists idx_groups_project on public.groups(project_id);
create index if not exists idx_labels_project on public.labels(project_id);
create index if not exists idx_tasks_project  on public.tasks(project_id);
create index if not exists idx_tasks_group    on public.tasks(group_id);
create index if not exists idx_tasks_parent   on public.tasks(parent_id);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id);
create index if not exists idx_comments_task  on public.comments(task_id);

-- ---------- Funciones de control de acceso ----------
create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = p and user_id = auth.uid());
$$;

create or replace function public.can_edit(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members
                 where project_id = p and user_id = auth.uid() and role in ('owner', 'editor'));
$$;

create or replace function public.is_owner(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members
                 where project_id = p and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.shares_project(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members a
                 join project_members b on a.project_id = b.project_id
                 where a.user_id = auth.uid() and b.user_id = other);
$$;

-- Buscar un usuario por nombre exacto para invitarlo (no lista a todos)
create or replace function public.find_profile(u text)
returns table (id uuid, username text, full_name text, avatar_color text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_color
  from profiles p where auth.uid() is not null and p.username = lower(trim(u));
$$;

-- Comprobar disponibilidad de nombre de usuario en el registro
create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where username = lower(trim(u)));
$$;

-- ---------- Triggers ----------
-- Crea el perfil al registrarse un usuario
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  if uname !~ '^[a-z0-9_.-]{3,30}$' then
    uname := left(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_.-]', '', 'g'), 20)
             || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into profiles (id, username, full_name)
  values (new.id, uname, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 80));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Al crear un proyecto: el creador queda como dueño + etiquetas y grupo por defecto
create or replace function public.handle_new_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, user_id, role) values (new.id, new.owner_id, 'owner');
  insert into labels (project_id, kind, name, color, position, is_done) values
    (new.id, 'status',   'Pendiente', '#c4c4c4', 0, false),
    (new.id, 'status',   'En curso',  '#fdab3d', 1, false),
    (new.id, 'status',   'Atascado',  '#e2445c', 2, false),
    (new.id, 'status',   'Listo',     '#00c875', 3, true),
    (new.id, 'priority', 'Baja',      '#579bfc', 0, false),
    (new.id, 'priority', 'Media',     '#5559df', 1, false),
    (new.id, 'priority', 'Alta',      '#401694', 2, false),
    (new.id, 'priority', 'Crítica',   '#333333', 3, false);
  insert into groups (project_id, name, color, position) values (new.id, 'Grupo 1', '#579bfc', 0);
  return new;
end $$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created after insert on public.projects
  for each row execute function public.handle_new_project();

-- El dueño de un proyecto no se puede cambiar por update; mantiene updated_at
create or replace function public.guard_project() returns trigger
language plpgsql as $$
begin
  if new.owner_id <> old.owner_id then raise exception 'No se puede cambiar el dueño del proyecto'; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists on_project_update on public.projects;
create trigger on_project_update before update on public.projects
  for each row execute function public.guard_project();

-- Integridad de tareas: todo debe pertenecer al mismo proyecto
create or replace function public.validate_task() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'No se puede mover una tarea a otro proyecto';
  end if;
  if new.group_id is not null and not exists
     (select 1 from groups where id = new.group_id and project_id = new.project_id) then
    raise exception 'El grupo no pertenece al proyecto';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id or not exists
       (select 1 from tasks where id = new.parent_id and project_id = new.project_id and parent_id is null) then
      raise exception 'Tarea padre inválida';
    end if;
    if exists (select 1 from tasks where parent_id = new.id) then
      raise exception 'Una tarea con subtareas no puede ser subtarea';
    end if;
  end if;
  if new.status_id is not null and not exists
     (select 1 from labels where id = new.status_id and project_id = new.project_id and kind = 'status') then
    raise exception 'Estado inválido';
  end if;
  if new.priority_id is not null and not exists
     (select 1 from labels where id = new.priority_id and project_id = new.project_id and kind = 'priority') then
    raise exception 'Prioridad inválida';
  end if;
  if new.assignee_id is not null and not exists
     (select 1 from project_members where project_id = new.project_id and user_id = new.assignee_id) then
    raise exception 'El responsable debe ser miembro del proyecto';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists on_task_write on public.tasks;
create trigger on_task_write before insert or update on public.tasks
  for each row execute function public.validate_task();

-- Comentarios: project_id se toma de la tarea; autor y tarea no cambian
create or replace function public.validate_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select project_id into new.project_id from tasks where id = new.task_id;
    if new.project_id is null then raise exception 'Tarea no encontrada'; end if;
  else
    if new.task_id <> old.task_id or new.author_id <> old.author_id or new.project_id <> old.project_id then
      raise exception 'No se puede reasignar un comentario';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists on_comment_write on public.comments;
create trigger on_comment_write before insert or update on public.comments
  for each row execute function public.validate_comment();

-- ---------- Row Level Security ----------
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.groups          enable row level security;
alter table public.labels          enable row level security;
alter table public.tasks           enable row level security;
alter table public.comments        enable row level security;

-- Usuarios anónimos (sin sesión) no tocan ninguna tabla
revoke all on all tables in schema public from anon;

-- profiles: ves tu perfil y el de quienes comparten proyecto contigo
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_project(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- projects
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (public.can_edit(id)) with check (public.can_edit(id));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_owner(id));

-- project_members: solo el dueño administra; cualquiera puede salir (excepto el dueño)
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members for select to authenticated
  using (public.is_member(project_id));
drop policy if exists members_insert on public.project_members;
create policy members_insert on public.project_members for insert to authenticated
  with check (public.is_owner(project_id) and role <> 'owner');
drop policy if exists members_update on public.project_members;
create policy members_update on public.project_members for update to authenticated
  using (public.is_owner(project_id) and user_id <> auth.uid())
  with check (public.is_owner(project_id) and role <> 'owner');
drop policy if exists members_delete on public.project_members;
create policy members_delete on public.project_members for delete to authenticated
  using ((public.is_owner(project_id) and user_id <> auth.uid())
         or (user_id = auth.uid() and role <> 'owner'));

-- groups, labels, tasks: miembros leen; dueño/editor escriben
do $$
declare t text;
begin
  foreach t in array array['groups', 'labels', 'tasks'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member(project_id))', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_edit(project_id))', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_edit(project_id)) with check (public.can_edit(project_id))', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.can_edit(project_id))', t);
  end loop;
end $$;

-- comments: todo miembro comenta; cada quien edita lo suyo; el dueño puede borrar cualquiera
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (public.is_member(project_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(project_id));
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_owner(project_id));

-- Las funciones auxiliares solo para usuarios con sesión (salvo disponibilidad de usuario)
revoke execute on function public.find_profile(text) from anon, public;
grant execute on function public.find_profile(text) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- Tiempo real (sincronización entre dispositivos) ----------
do $$
declare t text;
begin
  foreach t in array array['projects', 'project_members', 'groups', 'labels', 'tasks', 'comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
