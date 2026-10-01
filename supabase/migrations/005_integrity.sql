begin;
alter table visits add constraint free_matches_amount check ((amount=0 and free) or (amount>0 and not free));
create index visit_professional_date on visits(therapist_id,attended_at);
create index audit_record_date on audit(table_name,record_id,at);
create index timer_visit_date on timer_events(visit_id,created_at);
create index notes_visit_revision on notes(visit_id,revision desc);
create index appointment_professional_date on appointments(therapist_id,starts_at);
commit;
