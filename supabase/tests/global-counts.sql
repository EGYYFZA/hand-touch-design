-- Regression suite for deployed migration003. Operator/test-project only.
-- Bulk metadata fixtures are not physical Storage files. No email is sent.
-- Run with stop-on-error; the final rollback removes every fixture/change.
begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('40000000-0000-4000-8000-000000000001','authenticated','authenticated','egz-count-source@example.invalid','{}','{}',now(),now()),
 ('40000000-0000-4000-8000-000000000002','authenticated','authenticated','egz-count-requester@example.invalid','{}','{}',now(),now());
insert into public.egz_consents(owner_id,version) values
 ('40000000-0000-4000-8000-000000000001','count-test-v1'),
 ('40000000-0000-4000-8000-000000000002','count-test-v1');

-- One-byte metadata keeps the byte budgets below their thresholds. Therefore
-- these cases exercise object counts rather than accidentally hitting bytes.
with generated as (select gen_random_uuid() as id from generate_series(1,5000))
insert into public.egz_photos
 (id,owner_id,idempotency_key,consent_version,object_path,mode,name,bytes,width,height,sha256,status,created_at,expires_at)
select id,'40000000-0000-4000-8000-000000000001',id,'count-test-v1',
 '40000000-0000-4000-8000-000000000001/'||id::text||'.png','free','count-fixture.png',
 1,1,1,repeat('a',64),'ready',now(),now()+interval '30 days'
from generated;

set local role service_role;
do $$
declare v_id uuid := gen_random_uuid();
begin
  begin
    perform public.egz_reserve_photo('40000000-0000-4000-8000-000000000002',v_id,v_id,
      'free','daily-count-denied.png',1,1,1,repeat('b',64));
  exception when raise_exception then
    if sqlerrm='global_upload_count_quota' then return; end if;
    raise;
  end;
  raise exception 'EGZ count test failed: rolling24h global object cap was bypassed';
end;
$$;
reset role;

-- Old rows no longer consume the rolling24h counter, but still occupy archive
-- capacity until Storage removal has succeeded and status becomes deleted.
update public.egz_photos set created_at=now()-interval '2 days'
where owner_id='40000000-0000-4000-8000-000000000001';
set local role service_role;
do $$
declare v_id uuid := gen_random_uuid();
begin
  begin
    perform public.egz_reserve_photo('40000000-0000-4000-8000-000000000002',v_id,v_id,
      'free','retained-count-denied.png',1,1,1,repeat('b',64));
  exception when raise_exception then
    if sqlerrm='global_storage_count_quota' then return; end if;
    raise;
  end;
  raise exception 'EGZ count test failed: retained global object cap was bypassed';
end;
$$;
reset role;

-- A successful cleanup releases retained capacity; old tombstones must not
-- permanently prevent all future uploads. These are synthetic metadata rows,
-- so there are no actual files to remove before marking the fixture deleted.
update public.egz_photos set status='deleted'
where owner_id='40000000-0000-4000-8000-000000000001';
set local role service_role;
do $$
declare v_id uuid := gen_random_uuid(); v_count integer;
begin
  select count(*) into v_count from public.egz_reserve_photo(
    '40000000-0000-4000-8000-000000000002',v_id,v_id,
    'free','capacity-released.png',1,1,1,repeat('b',64));
  if v_count<>1 then raise exception 'EGZ count test failed: old deleted rows still block admission'; end if;
end;
$$;
reset role;

-- Client identities cannot call the privileged admission RPC regardless of
-- counter state. Do not grant execute while replacing its implementation.
do $$
begin
  if has_function_privilege('anon','public.egz_reserve_photo(uuid,uuid,uuid,text,text,integer,integer,integer,text)','EXECUTE')
     or has_function_privilege('authenticated','public.egz_reserve_photo(uuid,uuid,uuid,text,text,integer,integer,integer,text)','EXECUTE') then
    raise exception 'EGZ count test failed: privileged reserve RPC is client-callable';
  end if;
end;
$$;

select 'EGZ global count assertions passed; rolling back all fixtures' as result;
rollback;
