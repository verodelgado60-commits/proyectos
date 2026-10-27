-- Para que los borrados se sincronicen al instante entre dispositivos,
-- los eventos de eliminación deben incluir project_id (no solo el id).
alter table public.tasks           replica identity full;
alter table public.groups          replica identity full;
alter table public.labels          replica identity full;
alter table public.comments        replica identity full;
alter table public.project_members replica identity full;
alter table public.projects        replica identity full;
