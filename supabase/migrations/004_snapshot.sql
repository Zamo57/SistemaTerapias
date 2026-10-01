begin;
-- Snapshot consistente, con RLS del invocador: no mezcla versiones concurrentes.
create function public.workspace_snapshot() returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object(
'profiles',coalesce((select jsonb_agg(p) from profiles p),'[]'::jsonb),
'settings',coalesce((select jsonb_agg(p) from settings p),'[]'::jsonb),
'patients',coalesce((select jsonb_agg(p) from patients p),'[]'::jsonb),
'backgrounds',coalesce((select jsonb_agg(p) from backgrounds p),'[]'::jsonb),
'visits',coalesce((select jsonb_agg(p) from visits p),'[]'::jsonb),
'visit_therapies',coalesce((select jsonb_agg(p) from visit_therapies p),'[]'::jsonb),
'notes',coalesce((select jsonb_agg(p) from notes p),'[]'::jsonb),
'therapies',coalesce((select jsonb_agg(p) from therapies p),'[]'::jsonb),
'rates',coalesce((select jsonb_agg(p) from rates p),'[]'::jsonb),
'sinpe_numbers',coalesce((select jsonb_agg(p) from sinpe_numbers p),'[]'::jsonb),
'templates',coalesce((select jsonb_agg(p) from templates p),'[]'::jsonb),
'payments',coalesce((select jsonb_agg(p) from payments p),'[]'::jsonb),
'appointments',coalesce((select jsonb_agg(p) from appointments p),'[]'::jsonb)
); $$;
revoke execute on function workspace_snapshot() from public,anon;
grant execute on function workspace_snapshot() to authenticated;
commit;
