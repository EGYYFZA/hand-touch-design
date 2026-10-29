-- Add global object-count admission limits without changing deployed001.
-- This forward migration changes no existing rows or physical Storage objects.
-- Roll back by disabling new uploads, then a reviewed forward replacement.
begin;

create or replace function public.egz_reserve_photo(
  p_owner uuid, p_id uuid, p_idempotency_key uuid, p_mode text,
  p_name text, p_bytes integer, p_width integer, p_height integer, p_sha256 text
)
returns setof public.egz_photos
language plpgsql security definer set search_path = ''
as $$
declare
  v_existing public.egz_photos;
  v_consent public.egz_consents;
  v_count bigint;
  v_bytes bigint;
begin
  if p_owner is null or p_id is null or p_idempotency_key is null
     or p_mode is null or p_mode not in ('free','painting','photobooth','meme')
     or p_name is null or char_length(p_name) not between 1 and 180 or p_name ~ '[\r\n]'
     or p_bytes is null or p_bytes not between 1 and 3145728
     or p_width is null or p_height is null or p_width not between 1 and 8192 or p_height not between 1 and 8192
     or p_width::bigint * p_height::bigint > 16000000
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_photo' using errcode = '22023';
  end if;

  -- One global lock makes admission (including the global byte budget) atomic
  -- across users. No in-memory per-instance counter can provide this guarantee.
  perform pg_advisory_xact_lock(hashtextextended('egz-upload-global', 0));
  perform pg_advisory_xact_lock(hashtextextended('egz-upload-owner:' || p_owner::text, 0));
  select * into v_consent from public.egz_consents where owner_id = p_owner for update;
  if not found or v_consent.revoked_at is not null then
    raise exception 'consent_required' using errcode = '42501';
  end if;

  select * into v_existing from public.egz_photos
    where owner_id = p_owner and idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.sha256 <> p_sha256 or v_existing.mode <> p_mode or v_existing.bytes <> p_bytes
       or v_existing.width <> p_width or v_existing.height <> p_height then
      raise exception 'idempotency_conflict' using errcode = '22023';
    end if;
    if v_existing.status in ('deleting','deleted') or v_existing.consent_version <> v_consent.version
       or (v_existing.expires_at is not null and v_existing.expires_at <= now())
       or (v_existing.status in ('reserved','failed') and v_existing.created_at < now() - interval '1 hour') then
      raise exception 'photo_expired_or_deleted' using errcode = '42501';
    end if;
    return next v_existing;
    return;
  end if;

  select count(*), coalesce(sum(bytes), 0) into v_count, v_bytes
    from public.egz_photos where owner_id = p_owner and created_at >= now() - interval '1 day';
  if v_count >= 100 or v_bytes + p_bytes > 314572800 then
    raise exception 'daily_upload_quota' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.egz_photos
    where owner_id = p_owner and created_at >= now() - interval '1 minute';
  if v_count >= 10 then raise exception 'minute_upload_quota' using errcode = 'P0001'; end if;
  select count(*), coalesce(sum(bytes), 0) into v_count, v_bytes from public.egz_photos
    where created_at >= now() - interval '1 day';
  if v_count >= 5000 then
    raise exception 'global_upload_count_quota' using errcode = 'P0001';
  end if;
  if v_bytes + p_bytes > 1073741824 then
    raise exception 'global_upload_quota' using errcode = 'P0001';
  end if;
  -- Capacity admission is independent of the rolling daily transfer budget.
  -- Keep 800 MiB of metadata-reserved storage inside the project's 1 GiB Free
  -- allocation, leaving margin for in-flight cleanup and provider overhead.
  select count(*), coalesce(sum(bytes), 0) into v_count, v_bytes from public.egz_photos
    where status <> 'deleted';
  if v_count >= 5000 then
    raise exception 'global_storage_count_quota' using errcode = 'P0001';
  end if;
  if v_bytes + p_bytes > 838860800 then
    raise exception 'global_storage_quota' using errcode = 'P0001';
  end if;

  return query insert into public.egz_photos
    (id, owner_id, idempotency_key, consent_version, object_path, mode, name, bytes, width, height, sha256)
    values (p_id, p_owner, p_idempotency_key, v_consent.version,
      p_owner::text || '/' || p_id::text || '.png', p_mode, p_name, p_bytes, p_width, p_height, p_sha256)
    returning *;
end;
$$;
revoke all on function public.egz_reserve_photo(uuid, uuid, uuid, text, text, integer, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.egz_reserve_photo(uuid, uuid, uuid, text, text, integer, integer, integer, text) to service_role;

notify pgrst, 'reload schema';
commit;
