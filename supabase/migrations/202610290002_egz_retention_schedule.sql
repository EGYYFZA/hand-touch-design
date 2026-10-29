-- Additive scheduling migration. No object/user deletion occurs during apply.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function egz_internal.enqueue_retention()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_secret text; v_job_secret text; v_request bigint;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'egz_retention_auth';
  select decrypted_secret into v_job_secret from vault.decrypted_secrets where name = 'egz_retention_job_secret';
  if v_secret is null or v_job_secret is null then raise exception 'EGZ retention credential not configured'; end if;
  select net.http_post(
    url := 'https://chznehpvkuuooclyjhqg.supabase.co/functions/v1/egz-retention',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_secret,'X-EGZ-Retention-Secret',v_job_secret),
    body := '{}'::jsonb, timeout_milliseconds := 10000
  ) into v_request;
  return v_request;
end;
$$;
revoke all on function egz_internal.enqueue_retention() from public, anon, authenticated;
grant usage on schema egz_internal to service_role;
grant execute on function egz_internal.enqueue_retention() to service_role;
revoke all on net.http_request_queue, net._http_response from anon, authenticated;

-- The operator tool verifies the function and stores its credential in Vault
-- before enabling this schedule. No key is embedded in this migration/job.
select cron.schedule('egz-retention-30-days', '*/5 * * * *', 'select egz_internal.enqueue_retention();');
notify pgrst, 'reload schema';
commit;
