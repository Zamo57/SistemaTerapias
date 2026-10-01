begin;
-- Nombres anteriores se conservan: nunca se adivina su división.
alter table public.patients add column first_name text, add column first_surname text, add column second_surname text;
create table public.cedula_cache(cedula text primary key check(cedula ~ '^[0-9]{9}$'), nombre text not null, primer_apellido text not null, segundo_apellido text not null, fuente text not null check(fuente='GoMeta'), consulted_at timestamptz not null default now());
create table public.cedula_gate(id integer primary key check(id=1), blocked_until timestamptz);
insert into public.cedula_gate values(1,null);
create table public.cedula_usage(id bigint generated always as identity primary key, kind text not null check(kind in('user','external')), user_id uuid, at timestamptz not null default now());
create index cedula_usage_window on public.cedula_usage(kind,at,user_id);
create table public.cedula_flights(cedula text primary key, token uuid not null, expires_at timestamptz not null, status text not null);
-- Estas tablas solo pertenecen al backend; ni usuarios ni anon pueden enumerarlas.
alter table public.cedula_cache enable row level security;
alter table public.cedula_gate enable row level security;
alter table public.cedula_usage enable row level security;
alter table public.cedula_flights enable row level security;
revoke all on public.cedula_cache,public.cedula_gate,public.cedula_usage,public.cedula_flights from anon,authenticated;
grant all on public.cedula_cache,public.cedula_gate,public.cedula_usage,public.cedula_flights to service_role;
grant usage,select on sequence public.cedula_usage_id_seq to service_role;

create function public.cedula_user_limit(p_user uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from profiles where id=p_user and active) then return false; end if;
 perform 1 from cedula_gate where id=1 for update;
 delete from cedula_usage where at<=now()-interval '5 minutes';
 if (select count(*) from cedula_usage where kind='user' and user_id=p_user and at>now()-interval '1 minute')>=20 then return false; end if;
 insert into cedula_usage(kind,user_id) values('user',p_user);
 return true;
end $$;

create function public.cedula_reserve(p_cedula text,p_user uuid,p_token uuid,p_poll boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare cached cedula_cache; flight cedula_flights; blocked timestamptz; used integer; retry integer;
begin
 if p_cedula !~ '^[0-9]{9}$' then raise exception 'Identificación inválida'; end if;
 if not exists(select 1 from profiles where id=p_user and active) then return jsonb_build_object('state','forbidden'); end if;
 -- Una única fila serializa la reserva en todas las instancias, incluso con IP compartida.
 select blocked_until into blocked from cedula_gate where id=1 for update;
 delete from cedula_usage where at<=now()-interval '5 minutes';
 select * into cached from cedula_cache where cedula=p_cedula and consulted_at>now()-interval '30 days';
 if found then return jsonb_build_object('state','cached','data',jsonb_build_object('cedula',cached.cedula,'nombre',cached.nombre,'primer_apellido',cached.primer_apellido,'segundo_apellido',cached.segundo_apellido,'fuente',cached.fuente)); end if;
 select * into flight from cedula_flights where cedula=p_cedula and expires_at>now();
 if found then return jsonb_build_object('state',case when flight.status='running' then 'waiting' else flight.status end); end if;
 -- Un poll nunca inicia otra consulta; solo espera al dueño de la reserva original.
 if p_poll then return jsonb_build_object('state','unavailable'); end if;
 if blocked>now() then return jsonb_build_object('state','limited','retry',ceil(extract(epoch from blocked-now()))); end if;
 select count(*) into used from cedula_usage where kind='external' and at>now()-interval '5 minutes';
 if used>=20 then
  select greatest(1,ceil(extract(epoch from min(at)+interval '5 minutes'-now()))) into retry from cedula_usage where kind='external';
  return jsonb_build_object('state','limited','retry',retry);
 end if;
 insert into cedula_flights values(p_cedula,p_token,now()+interval '30 seconds','running') on conflict(cedula) do update set token=excluded.token,expires_at=excluded.expires_at,status='running';
 insert into cedula_usage(kind) values('external');
 return jsonb_build_object('state','owner');
end $$;
create function public.cedula_finish(p_cedula text,p_token uuid,p_status text,p_data jsonb default null,p_retry integer default 300) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from cedula_gate where id=1 for update;
 if not exists(select 1 from cedula_flights where cedula=p_cedula and token=p_token and status='running') then return; end if;
 if p_status='success' then
  if p_data->>'cedula'<>p_cedula or length(trim(coalesce(p_data->>'nombre','')))=0 then raise exception 'Resultado inválido'; end if;
  insert into cedula_cache values(p_cedula,p_data->>'nombre',p_data->>'primer_apellido',p_data->>'segundo_apellido','GoMeta',now()) on conflict(cedula) do update set nombre=excluded.nombre,primer_apellido=excluded.primer_apellido,segundo_apellido=excluded.segundo_apellido,fuente=excluded.fuente,consulted_at=excluded.consulted_at;
 end if;
 if p_status='limited' then update cedula_gate set blocked_until=greatest(coalesce(blocked_until,now()),now()+make_interval(secs=>greatest(1,p_retry))) where id=1; end if;
 -- Fallos se comparten unos segundos, pero nunca se guardan como éxitos en caché.
 update cedula_flights set status=case when p_status='success' then 'cached' else p_status end,expires_at=now()+interval '5 seconds' where cedula=p_cedula and token=p_token;
 delete from cedula_flights where expires_at<now()-interval '1 minute';
 delete from cedula_cache where consulted_at<=now()-interval '30 days';
end $$;
revoke all on function public.cedula_reserve(text,uuid,uuid,boolean),public.cedula_finish(text,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.cedula_reserve(text,uuid,uuid,boolean),public.cedula_finish(text,uuid,text,jsonb,integer) to service_role;
revoke all on function public.cedula_user_limit(uuid) from public,anon,authenticated;
grant execute on function public.cedula_user_limit(uuid) to service_role;
commit;
