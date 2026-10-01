begin;
create table public.import_batches(id uuid primary key, source text not null, count integer not null, created_by uuid not null default auth.uid() references profiles(id), created_at timestamptz not null default now());
alter table import_batches enable row level security;
create policy import_read on import_batches for select to authenticated using(allowed('admin'));
grant select on import_batches to authenticated;
create function public.import_patients(p_request uuid,p_source text,p_rows jsonb) returns integer language plpgsql security definer set search_path=public as $$ declare r jsonb; n integer; begin
 if not allowed('admin') then raise exception 'Sin permiso administrativo'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request::text));
 select count into n from import_batches where id=p_request; if n is not null then return n; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'Lote inválido'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
 insert into patients(document_type,document,name,phone,email,original_date,source) values(r->>'document_type',r->>'document',r->>'name',nullif(r->>'phone',''),nullif(r->>'email',''),nullif(r->>'original_date','')::date,p_source);
 end loop;
 n:=jsonb_array_length(p_rows);insert into import_batches(id,source,count) values(p_request,p_source,n);return n; end $$;
revoke all on function import_patients(uuid,text,jsonb) from public,anon;
grant execute on function import_patients(uuid,text,jsonb) to authenticated;
create function public.protect_author() returns trigger language plpgsql as $$ begin if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'La autoría original es inmutable'; end if; return new; end $$;
create trigger protect_patient_author before update on patients for each row execute function protect_author();
create function public.protect_last_admin() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if old.active and 'admin'=any(old.permissions) and (not new.active or not('admin'=any(new.permissions))) and not exists(select 1 from profiles where id<>old.id and active and 'admin'=any(permissions)) then raise exception 'Debe quedar al menos una cuenta administrativa activa'; end if; return new; end $$;
create trigger keep_admin before update on profiles for each row execute function protect_last_admin();
create function public.appointment_guard() returns trigger language plpgsql as $$ begin
 if not exists(select 1 from profiles where id=new.therapist_id and active and 'clinical'=any(permissions)) then raise exception 'Terapeuta no disponible'; end if;
 if TG_OP='UPDATE' and new.created_by is distinct from old.created_by then raise exception 'Autoría inmutable'; end if;
 perform pg_advisory_xact_lock(hashtext(new.therapist_id::text));
 if new.status='scheduled' and exists(select 1 from appointments where id<>new.id and therapist_id=new.therapist_id and status='scheduled' and starts_at<new.starts_at+make_interval(mins=>new.minutes) and starts_at+make_interval(mins=>minutes)>new.starts_at) then raise exception 'Existe otra cita para ese profesional en ese horario'; end if; return new; end $$;
create trigger validate_appointment before insert or update on appointments for each row execute function appointment_guard();
-- El personal no puede mutar pagos/notas/visitas directamente: solo RPC auditadas.
revoke insert,update,delete on visits,payments,notes,visit_therapies,timer_events,audit,import_batches from authenticated,anon;
revoke execute on function protect_author(),protect_last_admin(),appointment_guard() from public,anon;
commit;
