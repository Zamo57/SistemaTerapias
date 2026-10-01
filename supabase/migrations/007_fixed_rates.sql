begin;
-- Convertimos el antiguo catálogo 2×2 sin borrar silenciosamente importes.
do $$
begin
  if exists (
    select 1 from rates r cross join lateral jsonb_each(r.prices) p
    where (r.id=1 and p.key<>'30' and p.value<>'null'::jsonb)
       or (r.id=2 and p.key<>'60' and p.value<>'null'::jsonb)
  ) then
    raise exception 'Tarifas incompatibles: hay montos configurados en duraciones que no corresponden. Revise Tarifa 1/30 min y Tarifa 2/60 min antes de reintentar 007_fixed_rates.';
  end if;
end $$;

alter table rates add column minutes integer;
alter table rates add column amount bigint;
update rates set minutes=30,
  amount=coalesce(nullif(prices->>'30','')::bigint,2850000) where id=1;
update rates set minutes=60,
  amount=coalesce(nullif(prices->>'60','')::bigint,5700000) where id=2;
alter table rates alter column minutes set not null;
alter table rates alter column amount set not null;
alter table rates add constraint rates_fixed_duration check ((id=1 and minutes=30) or (id=2 and minutes=60));

drop trigger if exists validate_rate on rates;
drop function if exists validate_rate();
alter table rates drop column prices;
alter table rates add constraint rates_amount_positive check(amount>0 and amount<=100000000000);
revoke update on rates from authenticated;
grant update(minutes,amount) on rates to authenticated;
alter table visits drop constraint if exists visits_rate_name_check;
alter table visits add constraint visits_rate_name_check check(rate_name in('Tarifa 1','Tarifa 2','Monto personalizado','Tarifa modificable'));

create or replace function public.create_visit(p_patient uuid,p_therapist uuid,p_minutes integer,p_rate text,p_amount bigint,p_free boolean,p_reason text,p_therapies uuid[],p_at timestamptz default now()) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid; configured bigint; configured_minutes integer;
begin
 if not(allowed('clinical') or allowed('reception')) then raise exception 'Sin permiso'; end if;
 if not exists(select 1 from profiles where id=p_therapist and active and 'clinical'=any(permissions)) then raise exception 'Terapeuta no autorizado'; end if;
 if p_rate in('Tarifa 1','Tarifa 2') then
   select amount,minutes into configured,configured_minutes from rates where name=p_rate;
   if configured is null then raise exception 'Tarifa pendiente de configurar'; end if;
   if p_minutes<>configured_minutes or configured<>p_amount then raise exception 'Tarifa cambió; revisá duración e importe'; end if;
 end if;
 if p_rate not in('Tarifa 1','Tarifa 2','Monto personalizado','Tarifa modificable') then raise exception 'Modalidad de tarifa inválida'; end if;
 if cardinality(p_therapies)<1 or p_therapies is null then raise exception 'Seleccioná una terapia'; end if;
 if exists(select 1 from unnest(p_therapies) t where not exists(select 1 from therapies where id=t and active)) then raise exception 'Terapia no disponible'; end if;
 insert into visits(patient_id,therapist_id,minutes,rate_name,amount,free,adjustment_reason,attended_at) values(p_patient,p_therapist,p_minutes,p_rate,p_amount,p_free,p_reason,p_at) returning id into v;
 insert into visit_therapies select v,id,name from therapies where id=any(p_therapies); return v;
end $$;
commit;
