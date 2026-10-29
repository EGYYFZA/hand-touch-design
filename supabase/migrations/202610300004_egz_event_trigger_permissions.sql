begin;

-- This event-trigger function is managed by the project's automatic-RLS setup.
-- API clients must not execute it. Revoking EXECUTE does not remove the trigger.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- egz_is_admin and egz_admin_consent_active intentionally remain executable by
-- authenticated: RLS evaluates these caller-scoped, fixed-search-path helpers.
notify pgrst, 'reload schema';
commit;
