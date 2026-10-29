begin;

-- Exercise the proposed permission change transactionally before deployment.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
do $$
begin
  if has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') then
    raise exception 'API clients can execute the event-trigger function';
  end if;
  if not has_function_privilege('authenticated', 'public.egz_is_admin()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.egz_admin_consent_active(uuid,text)', 'EXECUTE') then
    raise exception 'Required RLS helper permissions were removed';
  end if;
end;
$$;

-- Prove that ordinary operator DDL still receives automatic RLS after revoke.
create table public.egz_rls_permission_fixture (id bigint primary key);
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.egz_rls_permission_fixture'::regclass) then
    raise exception 'Automatic RLS no longer works';
  end if;
end;
$$;

rollback;
