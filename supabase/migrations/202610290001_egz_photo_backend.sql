-- EGZ application schema. Apply once; do not edit after deployment.
-- New, empty application tables only. No camera data or auth accounts are seeded.
-- Forward rollback and lifecycle notes: supabase/README.md.
begin;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'photo-archive' and public = false) then
    raise exception 'photo-archive must already exist as a PRIVATE bucket';
  end if;
end;
$$;

create table public.egz_consents (
  owner_id uuid primary key references auth.users(id) on delete restrict,
  version text not null check (char_length(version) between 1 and 80),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);

create table public.egz_admin_memberships (
  user_id uuid primary key references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.egz_photos (
  id uuid primary key,
  owner_id uuid not null references public.egz_consents(owner_id) on delete restrict,
  idempotency_key uuid not null,
  consent_version text not null check (char_length(consent_version) between 1 and 80),
  object_path text not null unique,
  mode text not null check (mode in ('free', 'painting', 'photobooth', 'meme')),
  name text not null check (char_length(name) between 1 and 180 and name !~ '[\r\n]'),
  bytes integer not null check (bytes between 1 and 3145728),
  width integer not null check (width between 1 and 8192),
  height integer not null check (height between 1 and 8192),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'reserved' check (status in ('reserved', 'ready', 'failed', 'deleting', 'deleted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  check (width::bigint * height::bigint <= 16000000),
  check (object_path = owner_id::text || '/' || id::text || '.png'),
  check (status <> 'ready' or expires_at is not null)
);

create index egz_photos_owner_created_idx on public.egz_photos(owner_id, created_at desc, id desc);
create index egz_photos_expiry_idx on public.egz_photos(expires_at) where status in ('ready', 'deleting');
create index egz_photos_created_idx on public.egz_photos(created_at);
create index egz_photos_deleted_idx on public.egz_photos(deleted_at, updated_at) where status = 'deleted';

create table public.egz_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  owner_id uuid not null references auth.users(id) on delete restrict,
  tokens_encrypted text not null check (char_length(tokens_encrypted) between 1 and 16384),
  expires_at timestamptz not null,
  csrf_hash text not null check (csrf_hash ~ '^[0-9a-f]{64}$'),
  refresh_lock_token text,
  refresh_lock_until timestamptz,
  created_at timestamptz not null default now(),
  check ((refresh_lock_token is null) = (refresh_lock_until is null))
);
create index egz_sessions_expiry_idx on public.egz_sessions(expires_at);
create index egz_sessions_owner_idx on public.egz_sessions(owner_id);

create table public.egz_rate_limits (
  key text not null check (char_length(key) between 1 and 256),
  window_start timestamptz not null,
  window_seconds integer not null check (window_seconds between 1 and 86400),
  count integer not null default 1 check (count > 0),
  primary key (key, window_start, window_seconds)
);

create table public.egz_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete restrict,
  action text not null check (char_length(action) between 1 and 80),
  photo_id uuid references public.egz_photos(id) on delete restrict,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
  created_at timestamptz not null default now()
);
create index egz_audit_events_created_idx on public.egz_audit_events(created_at desc);

alter table public.egz_consents enable row level security;
alter table public.egz_admin_memberships enable row level security;
alter table public.egz_photos enable row level security;
alter table public.egz_sessions enable row level security;
alter table public.egz_rate_limits enable row level security;
alter table public.egz_audit_events enable row level security;

revoke all on public.egz_consents, public.egz_admin_memberships, public.egz_photos,
  public.egz_sessions, public.egz_rate_limits, public.egz_audit_events from public, anon, authenticated;
grant select on public.egz_consents, public.egz_photos to authenticated;
grant all on public.egz_consents, public.egz_admin_memberships, public.egz_photos,
  public.egz_sessions, public.egz_rate_limits to service_role;
grant select, insert on public.egz_audit_events to service_role;
revoke all on sequence public.egz_audit_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.egz_audit_events_id_seq to service_role;

create function public.egz_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
    and exists (
      select 1 from public.egz_admin_memberships m
      where m.user_id = auth.uid() and m.revoked_at is null
    );
$$;
revoke all on function public.egz_is_admin() from public, anon;
grant execute on function public.egz_is_admin() to authenticated, service_role;

create function public.egz_admin_consent_active(p_owner uuid, p_version text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.egz_is_admin()
    and exists (
      select 1 from public.egz_consents c
      where c.owner_id = p_owner and c.version = p_version and c.revoked_at is null
    );
$$;
revoke all on function public.egz_admin_consent_active(uuid, text) from public, anon;
grant execute on function public.egz_admin_consent_active(uuid, text) to authenticated, service_role;

create policy egz_consent_owner_read on public.egz_consents for select to authenticated
  using (owner_id = (select auth.uid()));
create policy egz_photo_owner_or_mfa_admin_read on public.egz_photos for select to authenticated
  using (
    status = 'ready' and expires_at > now()
    and (owner_id = (select auth.uid()) or public.egz_admin_consent_active(owner_id, consent_version))
  );

-- A server-written Storage object has no assumed per-user Storage owner. The
-- metadata row and its RLS policy determine the read grant instead.
create policy egz_private_photo_read on storage.objects for select to authenticated
  using (
    bucket_id = 'photo-archive'
    and exists (
      select 1 from public.egz_photos p
      where p.object_path = storage.objects.name
    )
  );

create function public.egz_touch_photo_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  -- A retention retry must not reset the first-delete age and perpetually keep
  -- one tombstone in the 24-hour reconciliation window. The Storage worker may
  -- set the first timestamp explicitly; subsequent updates cannot extend it.
  if old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
  elsif new.status = 'deleted' and new.deleted_at is null then
    new.deleted_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.egz_touch_photo_updated_at() from public, anon, authenticated;
create trigger egz_photos_updated_at before update on public.egz_photos
  for each row execute function public.egz_touch_photo_updated_at();

create function public.egz_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 256
     or p_limit is null or p_limit not between 1 and 1000000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into public.egz_rate_limits as limits (key, window_start, window_seconds, count)
    values (p_key, v_window, p_window_seconds, 1)
    on conflict (key, window_start, window_seconds) do update
      set count = limits.count + 1 where limits.count < p_limit
    returning count into v_count;
  return v_count is not null;
end;
$$;
revoke all on function public.egz_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.egz_rate_limit(text, integer, integer) to service_role;

create function public.egz_claim_refresh(p_hash text, p_lock_token text)
returns setof public.egz_sessions
language sql volatile security definer set search_path = ''
as $$
  update public.egz_sessions
  set refresh_lock_token = p_lock_token, refresh_lock_until = now() + interval '45 seconds'
  where token_hash = p_hash and expires_at > now()
    and char_length(p_lock_token) between 16 and 128
    and (refresh_lock_until is null or refresh_lock_until < now())
  returning *;
$$;
revoke all on function public.egz_claim_refresh(text, text) from public, anon, authenticated;
grant execute on function public.egz_claim_refresh(text, text) to service_role;

create function public.egz_set_consent(p_owner uuid, p_granted boolean, p_version text)
returns setof public.egz_consents
language plpgsql security definer set search_path = ''
as $$
begin
  if p_owner is null or p_granted is null or p_version is null or char_length(p_version) not between 1 and 80 then
    raise exception 'invalid_consent' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('egz-upload-owner:' || p_owner::text, 0));
  if p_granted then
    return query insert into public.egz_consents as consent (owner_id, version, granted_at, revoked_at)
      values (p_owner, p_version, now(), null)
      on conflict (owner_id) do update set version = excluded.version,
        granted_at = excluded.granted_at, revoked_at = null
      returning *;
  else
    update public.egz_photos set status = 'deleting'
      where owner_id = p_owner and status in ('reserved', 'ready', 'failed');
    return query update public.egz_consents set revoked_at = coalesce(revoked_at, now())
      where owner_id = p_owner returning *;
  end if;
end;
$$;
revoke all on function public.egz_set_consent(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.egz_set_consent(uuid, boolean, text) to service_role;

create function public.egz_reserve_photo(
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
  select coalesce(sum(bytes), 0) into v_bytes from public.egz_photos
    where created_at >= now() - interval '1 day';
  if v_bytes + p_bytes > 1073741824 then
    raise exception 'global_upload_quota' using errcode = 'P0001';
  end if;
  -- Capacity admission is independent of the rolling daily transfer budget.
  -- Keep 800 MiB of metadata-reserved storage inside the project's 1 GiB Free
  -- allocation, leaving margin for in-flight cleanup and provider overhead.
  select coalesce(sum(bytes), 0) into v_bytes from public.egz_photos
    where status <> 'deleted';
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

create function public.egz_complete_photo(p_id uuid, p_bytes integer)
returns setof public.egz_photos
language plpgsql security definer set search_path = ''
as $$
declare
  v_photo public.egz_photos;
  v_consent public.egz_consents;
begin
  select * into v_photo from public.egz_photos where id = p_id;
  if not found then raise exception 'photo_not_found' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('egz-upload-owner:' || v_photo.owner_id::text, 0));
  select * into v_consent from public.egz_consents where owner_id = v_photo.owner_id for share;
  select * into v_photo from public.egz_photos where id = p_id for update;
  if not found then raise exception 'photo_not_found' using errcode = 'P0002'; end if;
  if p_bytes is null or p_bytes <> v_photo.bytes then
    raise exception 'photo_size_mismatch' using errcode = '22023';
  end if;
  if v_consent.owner_id is null or v_consent.revoked_at is not null or v_consent.version <> v_photo.consent_version then
    raise exception 'consent_required' using errcode = '42501';
  end if;
  if v_photo.status = 'ready' and v_photo.expires_at > now() then return next v_photo; return; end if;
  if v_photo.status not in ('reserved','failed') or v_photo.expires_at is not null
     or v_photo.created_at < now() - interval '1 hour' then
    raise exception 'photo_expired_or_deleted' using errcode = '42501';
  end if;
  return query update public.egz_photos
    set status = 'ready', expires_at = now() + interval '30 days'
    where id = p_id returning *;
end;
$$;
revoke all on function public.egz_complete_photo(uuid, integer) from public, anon, authenticated;
grant execute on function public.egz_complete_photo(uuid, integer) to service_role;

create function public.egz_housekeeping()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_sessions integer; v_counters integer;
begin
  with old as (select token_hash from public.egz_sessions where expires_at <= now() limit 1000)
    delete from public.egz_sessions s using old where s.token_hash = old.token_hash;
  get diagnostics v_sessions = row_count;
  with old as (select ctid from public.egz_rate_limits where window_start < now() - interval '2 days' limit 1000)
    delete from public.egz_rate_limits r using old where r.ctid = old.ctid;
  get diagnostics v_counters = row_count;
  return jsonb_build_object('sessions_deleted', v_sessions, 'counters_deleted', v_counters);
end;
$$;
revoke all on function public.egz_housekeeping() from public, anon, authenticated;
grant execute on function public.egz_housekeeping() to service_role;

notify pgrst, 'reload schema';
commit;
