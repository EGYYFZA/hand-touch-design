-- Integration regression suite for 202610290001_egz_photo_backend.sql.
-- Run as postgres/operator on a dedicated test project with stop-on-error.
-- Every fixture, Storage METADATA row, and assertion is inside one rollback.
-- No email is sent; no physical Storage object is uploaded or deleted here.
begin;

create temporary table egz_test_namespace_init(id integer) on commit drop;

create function pg_temp.egz_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'EGZ test failed: %', p_message; end if;
end;
$$;
create function pg_temp.egz_expect_denied(p_query text)
returns void language plpgsql as $$
begin
  begin
    execute p_query;
  exception when insufficient_privilege then return;
  end;
  raise exception 'EGZ test failed: forbidden operation succeeded';
end;
$$;
do $$ begin
  execute format('grant usage on schema %I to authenticated, anon, service_role', pg_my_temp_schema()::regnamespace);
end $$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'egz-fixture-a@example.invalid', '{}', '{}', now(), now()),
 ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'egz-fixture-b@example.invalid', '{}', '{}', now(), now()),
 ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'egz-fixture-admin@example.invalid', '{}', '{}', now(), now()),
 ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'egz-fixture-no-consent@example.invalid', '{}', '{}', now(), now());

insert into public.egz_consents(owner_id, version) values
 ('10000000-0000-4000-8000-000000000001', 'test-v1'),
 ('10000000-0000-4000-8000-000000000002', 'test-v1');
insert into public.egz_admin_memberships(user_id) values ('10000000-0000-4000-8000-000000000003');
insert into public.egz_photos
  (id, owner_id, idempotency_key, consent_version, object_path, mode, name, bytes, width, height, sha256, status, expires_at)
values
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'test-v1',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.png', 'free', 'a.png', 123, 2, 2, repeat('a',64), 'ready', now()+interval '30 days'),
 ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'test-v1',
  '10000000-0000-4000-8000-000000000002/20000000-0000-4000-8000-000000000002.png', 'painting', 'b.png', 123, 2, 2, repeat('b',64), 'ready', now()+interval '30 days'),
 ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'test-v1',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000003.png', 'meme', 'expired.png', 123, 2, 2, repeat('c',64), 'ready', now()-interval '1 second'),
 ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', 'test-v1',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000004.png', 'photobooth', 'reserved.png', 123, 2, 2, repeat('d',64), 'reserved', null);

-- Synthetic metadata only, to test Storage RLS. Do not use this to upload files.
insert into storage.objects(bucket_id, name)
select 'photo-archive', object_path from public.egz_photos where id::text like '20000000-0000-4000-8000-%';

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","user_metadata":{"role":"admin"}}', true);
set local role authenticated;
select pg_temp.egz_assert((select count(*) = 1 from public.egz_photos), 'A only sees its ready unexpired photo');
select pg_temp.egz_assert((select count(*) = 1 from public.egz_consents), 'A only sees its own consent');
select pg_temp.egz_assert(not public.egz_is_admin(), 'User-editable role claim cannot grant admin');
select pg_temp.egz_assert((select count(*) = 1 from storage.objects where bucket_id = 'photo-archive'), 'A only reads own matching Storage metadata');
select pg_temp.egz_expect_denied('select * from public.egz_sessions');
select pg_temp.egz_expect_denied('select * from public.egz_admin_memberships');
select pg_temp.egz_expect_denied('select * from public.egz_audit_events');
select pg_temp.egz_expect_denied('update public.egz_photos set name=''tampered.png''');
select pg_temp.egz_expect_denied('delete from public.egz_photos');
select pg_temp.egz_expect_denied('insert into public.egz_admin_memberships(user_id) values (''10000000-0000-4000-8000-000000000001'')');
select pg_temp.egz_expect_denied('select public.egz_rate_limit(''forged'',1000,60)');
select pg_temp.egz_expect_denied('select * from public.egz_claim_refresh(repeat(''a'',64),repeat(''b'',32))');
select pg_temp.egz_expect_denied('insert into storage.objects(bucket_id,name) values (''photo-archive'',''forbidden-client-upload.png'')');
reset role;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.egz_assert((select array_agg(id::text) = array['20000000-0000-4000-8000-000000000002'] from public.egz_photos), 'B cannot read A by bypassing UI');
select pg_temp.egz_assert((select count(*) = 1 from storage.objects where bucket_id = 'photo-archive'), 'B cannot download/list A through Storage policy');
reset role;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select pg_temp.egz_assert(not public.egz_is_admin(), 'Admin without MFA has no admin privilege');
select pg_temp.egz_assert((select count(*) = 0 from public.egz_photos), 'Admin aal1 cannot list others');
reset role;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select pg_temp.egz_assert(public.egz_is_admin(), 'Membership and aal2 permit admin');
select pg_temp.egz_assert((select count(*) = 2 from public.egz_photos), 'Admin sees only ready unexpired consented photos');
select pg_temp.egz_assert((select count(*) = 2 from storage.objects where bucket_id = 'photo-archive'), 'Admin Storage read follows photo visibility');
reset role;

update public.egz_consents set revoked_at = now() where owner_id = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.egz_assert((select count(*) = 1 from public.egz_photos), 'Consent withdrawal immediately removes admin access');
select pg_temp.egz_assert((select count(*) = 1 from storage.objects where bucket_id = 'photo-archive'), 'Withdrawal protects Storage too');
reset role;
update public.egz_consents set revoked_at = null where owner_id = '10000000-0000-4000-8000-000000000001';

update public.egz_admin_memberships set revoked_at = now() where user_id = '10000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.egz_assert(not public.egz_is_admin(), 'Revoked admin loses privilege without trusting cached UI role');
select pg_temp.egz_assert((select count(*) = 0 from public.egz_photos), 'Revoked admin cannot list archive');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select pg_temp.egz_expect_denied('select * from public.egz_photos');
select pg_temp.egz_expect_denied('select * from public.egz_consents');
reset role;

-- Service-only transactional admission, digest-bound idempotency, and expiry.
set local role service_role;
select pg_temp.egz_assert(public.egz_rate_limit('egz-test:' || txid_current()::text, 2, 60), 'Rate request 1 admitted');
select pg_temp.egz_assert(public.egz_rate_limit('egz-test:' || txid_current()::text, 2, 60), 'Rate request 2 admitted');
select pg_temp.egz_assert(not public.egz_rate_limit('egz-test:' || txid_current()::text, 2, 60), 'Rate request 3 denied');
select * from public.egz_reserve_photo('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005',
 '30000000-0000-4000-8000-000000000005', 'free', 'new.png', 123, 2, 2, repeat('e',64));
select * from public.egz_reserve_photo('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006',
 '30000000-0000-4000-8000-000000000005', 'free', 'ignored-retry-name.png', 123, 2, 2, repeat('e',64));
select pg_temp.egz_assert((select count(*) = 1 from public.egz_photos where idempotency_key = '30000000-0000-4000-8000-000000000005'), 'Retry reuses one reservation');
do $$ begin
  begin
    perform public.egz_reserve_photo('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000005', 'free', 'new.png', 123, 2, 2, repeat('f',64));
  exception when invalid_parameter_value then return;
  end;
  raise exception 'EGZ test failed: changed digest reused idempotency key';
end; $$;
select * from public.egz_complete_photo('20000000-0000-4000-8000-000000000005',123);
select pg_temp.egz_assert((select expires_at = now()+interval '30 days' from public.egz_photos where id='20000000-0000-4000-8000-000000000005'), 'Expiry is first-ready +30 days');
update public.egz_photos set expires_at=now()+interval '29 days' where id='20000000-0000-4000-8000-000000000005';
select * from public.egz_complete_photo('20000000-0000-4000-8000-000000000005',123);
select pg_temp.egz_assert((select expires_at = now()+interval '29 days' from public.egz_photos where id='20000000-0000-4000-8000-000000000005'), 'Ready retry does not extend expiry');

update public.egz_photos set created_at=now()-interval '2 hours'
  where id='20000000-0000-4000-8000-000000000004';
select pg_temp.egz_expect_denied('select * from public.egz_reserve_photo(''10000000-0000-4000-8000-000000000001'',''20000000-0000-4000-8000-000000000004'',''30000000-0000-4000-8000-000000000004'',''photobooth'',''reserved.png'',123,2,2,repeat(''d'',64))');
select pg_temp.egz_expect_denied('select * from public.egz_complete_photo(''20000000-0000-4000-8000-000000000004'',123)');
update public.egz_photos set created_at=now()
  where id='20000000-0000-4000-8000-000000000004';

do $$
declare v_id uuid; v_index integer;
begin
  -- Three initial A rows plus one idempotent reservation already count as four.
  for v_index in 1..6 loop
    v_id := gen_random_uuid();
    perform public.egz_reserve_photo('10000000-0000-4000-8000-000000000001',v_id,v_id,
      'free','quota.png',123,2,2,repeat('a',64));
  end loop;
  begin
    v_id := gen_random_uuid();
    perform public.egz_reserve_photo('10000000-0000-4000-8000-000000000001',v_id,v_id,
      'free','over-quota.png',123,2,2,repeat('a',64));
  exception when raise_exception then
    if sqlerrm = 'minute_upload_quota' then return; end if;
    raise;
  end;
  raise exception 'EGZ test failed: eleventh upload admitted inside one minute';
end; $$;

savepoint capacity_fixture;
-- Metadata-only old rows test the retained-capacity budget separately from
-- rolling upload quotas. No physical Storage object is created for them.
with generated as (select gen_random_uuid() as id from generate_series(1,267))
insert into public.egz_photos
  (id,owner_id,idempotency_key,consent_version,object_path,mode,name,bytes,width,height,sha256,status,created_at,expires_at)
select id,'10000000-0000-4000-8000-000000000002',id,'test-v1',
  '10000000-0000-4000-8000-000000000002/'||id::text||'.png','free','capacity-fixture.png',
  3145728,1024,1024,repeat('a',64),'ready',now()-interval '2 days',now()+interval '1 day'
from generated;
do $$
declare v_id uuid := gen_random_uuid();
begin
  begin
    perform public.egz_reserve_photo('10000000-0000-4000-8000-000000000002',v_id,v_id,
      'free','capacity-denied.png',123,2,2,repeat('a',64));
  exception when raise_exception then
    if sqlerrm='global_storage_quota' then return; end if;
    raise;
  end;
  raise exception 'EGZ test failed: retained storage cap exceeded';
end; $$;
rollback to savepoint capacity_fixture;

select * from public.egz_set_consent('10000000-0000-4000-8000-000000000001',false,'test-v1');
select pg_temp.egz_assert((select count(*)=0 from public.egz_photos where owner_id='10000000-0000-4000-8000-000000000001' and status in ('ready','reserved','failed')), 'Revoke marks all owner candidates deleting atomically');
select * from public.egz_set_consent('10000000-0000-4000-8000-000000000001',true,'test-v1');
select pg_temp.egz_assert((select status='deleting' from public.egz_photos where id='20000000-0000-4000-8000-000000000005'), 'Regrant never resurrects revoked photos');
-- The worker supplies first deleted_at after Storage removal; repeat cleanup
-- may rotate updated_at but must never extend the tombstone reconciliation age.
update public.egz_photos set status='deleted',deleted_at=now()-interval '2 hours'
  where id='20000000-0000-4000-8000-000000000005';
update public.egz_photos set deleted_at=now()
  where id='20000000-0000-4000-8000-000000000005';
select pg_temp.egz_assert((select deleted_at=now()-interval '2 hours' from public.egz_photos where id='20000000-0000-4000-8000-000000000005'), 'Repeated deletion preserves first deleted_at');
select pg_temp.egz_expect_denied('select * from public.egz_reserve_photo(''10000000-0000-4000-8000-000000000004'',''20000000-0000-4000-8000-000000000007'',''30000000-0000-4000-8000-000000000007'',''free'',''no-consent.png'',123,2,2,repeat(''a'',64))');

insert into public.egz_sessions(token_hash, owner_id, tokens_encrypted, expires_at, csrf_hash)
values (repeat('a',64), '10000000-0000-4000-8000-000000000001', 'synthetic-encrypted-fixture', now()+interval '1 hour', repeat('b',64));
select pg_temp.egz_assert((select count(*)=1 from public.egz_claim_refresh(repeat('a',64),repeat('c',32))), 'Refresh lock claim succeeds once');
select pg_temp.egz_assert((select count(*)=0 from public.egz_claim_refresh(repeat('a',64),repeat('d',32))), 'Concurrent refresh claim is denied');
delete from public.egz_sessions where token_hash=repeat('a',64);
select pg_temp.egz_assert((select count(*)=0 from public.egz_claim_refresh(repeat('a',64),repeat('e',32))), 'Logout prevents refresh resurrection');
reset role;

select 'EGZ database authorization assertions passed; rolling back all fixtures' as result;
rollback;
