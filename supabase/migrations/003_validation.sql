begin;
create function public.validate_rate() returns trigger language plpgsql as $$ declare entry record; begin
 if jsonb_typeof(new.prices)<>'object' then raise exception 'Precios inválidos'; end if;
 for entry in select * from jsonb_each(new.prices) loop
 if entry.key not in('30','60') or jsonb_typeof(entry.value)<>'number' or entry.value::text !~ '^[0-9]+$' or entry.value::text::numeric>100000000000 then raise exception 'Solo duraciones 30/60 y montos enteros no negativos'; end if; end loop; return new; end $$;
create trigger validate_rate before insert or update on rates for each row execute function validate_rate();
create function public.lock_final_note() returns trigger language plpgsql as $$ begin if exists(select 1 from notes where visit_id=new.visit_id and finalized) then new.finalized:=true; end if; return new; end $$;
create trigger final_note before insert on notes for each row execute function lock_final_note();
create function public.server_time() returns timestamptz language sql stable as $$ select now() $$;
revoke execute on function validate_rate(),lock_final_note(),server_time() from public,anon;
grant execute on function server_time() to authenticated;
revoke update on rates,profiles from authenticated;
grant update(prices) on rates to authenticated;
grant update(name,active,permissions) on profiles to authenticated;
commit;
