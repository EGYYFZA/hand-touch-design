# EGZ Supabase migrations

Project: `chznehpvkuuooclyjhqg`; no credential belongs in this directory.

## Applied migration verification

Verified by the primary implementation agent on 2026-10-29:

- `202610290001_egz_photo_backend.sql` applied to the live project; the complete
  rollback-only `tests/authorization.sql` suite passed against that database.
- `202610290002_egz_retention_schedule.sql` applied to the live project.
- `202610290003_egz_global_photo_counts.sql` applied to the live project. It
  adds a 5,000-object rolling24h admission cap and a 5,000-object retained cap,
  supplementing the existing 800 MiB retained-byte budget.

These deployed files are immutable. New corrections require a new forward
migration. `tests/global-counts.sql` also passed against the live project with
5,000 tiny synthetic metadata rows; all fixtures were rolled back. This SQL
suite uploads no physical files and sends no email.

The separate live integration suite passed 25 checks, including physical
synthetic object removal through the deployed `egz-retention` function. The
active `*/5 * * * *` cron delivered HTTP200; an anonymous function request was
rejected. Live Auth, Storage, metadata and audit fixtures were cleaned up.
These are distinct checks: a scheduler configuration alone is not evidence of
successful file removal. See `docs/backend-integration-status.md` for limits.

## Apply and verify

`migrations/202610290001_egz_photo_backend.sql` is an additive schema migration
for new, empty application tables. Apply it once as the database operator after
review. It requires the existing **private** `photo-archive` bucket and does not
seed users, membership, photos, or secrets. Regular indexes are intentional on
new tables; no existing application table is rewritten or backfilled.

Run `tests/authorization.sql` as the operator using stop-on-error, for example
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/authorization.sql`.
The test is SQL-only, has synthetic account identifiers/Storage metadata,
sends no email, creates no physical photo object, and rolls every fixture back.
Do not claim it passed until executed against the migrated database. A second
database connection is needed to additionally verify concurrent quota races;
the admission code serializes through transaction advisory locks.

Apply deployed changes through a **new forward migration**. Do not edit an
already-applied migration or use an unrecorded dashboard schema edit. The first
migration is not intentionally re-runnable: duplicate-object failure prevents
silently replacing policies/functions on a live project.

## API contract

- `egz_rate_limit(p_key text, p_limit int, p_window_seconds int) -> boolean`:
  atomic fixed-window counter. Service-only; invalid ranges fail.
- `egz_claim_refresh(p_hash text,p_lock_token text) -> SETOF egz_sessions`:
  claims an unexpired opaque app session for 45 seconds; empty result means
  locked, missing, expired, or invalid lock token. Release with a conditional
  update matching both hash and lock token. Never upsert a session on refresh.
- `egz_set_consent(p_owner uuid,p_granted boolean,p_version text) -> SETOF egz_consents`:
  serializes against the owner's uploads. Revocation also marks all that
  owner's reserved/ready/failed photos `deleting`, preventing future re-grant
  from resurrecting old archives. Missing consent revoke returns no row.
- `egz_reserve_photo(p_owner uuid,p_id uuid,p_idempotency_key uuid,p_mode text,
  p_name text,p_bytes int,p_width int,p_height int,p_sha256 text)
  -> SETOF egz_photos`: returns one new or existing reservation, never a client
  supplied path. Same owner/key must have identical normalized PNG digest,
  dimensions, mode, and byte count. Reusing deleted/expired consent versions
  or unfinished reservations older than one hour fails. Existing names/IDs are preserved. Counts include failed/deleted
  admissions in the rolling quota window so deletion cannot bypass quota.
  Admission also caps retained bytes across nondeleted rows at 800 MiB,
  independently of the 1 GiB rolling daily transfer budget.
- `egz_complete_photo(p_id uuid,p_bytes int) -> SETOF egz_photos`: service must
  first confirm Storage upload. Requires active matching consent and byte
  count. First successful completion sets `ready` and +30-day expiry; an
  already-ready retry preserves expiry. Does not itself verify object bytes.
  Unfinished reservations older than one hour cannot be completed.
- `egz_housekeeping() -> jsonb`: deletes at most 1,000 expired app sessions and
  1,000 rate counters older than two days. Does **not** delete photo objects.
- `egz_is_admin() -> boolean`: read helper requiring a nonrevoked operator
  membership and JWT `aal2`. User metadata cannot grant membership.

Audit insert contract: `egz_audit_events(actor_id uuid nullable,action text,
photo_id uuid nullable,details jsonb object)`. IDs and timestamps are generated.
Only the service can insert/read; no service UPDATE/DELETE grants. Avoid photo
contents, emails, access tokens, signed URLs, and other secrets in `details`.

All application mutators are service-only with a fixed empty `search_path`;
frontend callers have only SELECT on their consent and visible photo rows.
Storage SELECT delegates to photo RLS, including expiry and admin consent.
No client Storage INSERT/UPDATE/DELETE policy is created. The service bypasses
RLS, so the BFF must independently authenticate, check CSRF/Origin, derive owner
UID from its verified session, validate the PNG, and check admin membership/MFA.

## Retention and cleanup

The first-ready expiry is 30 days for both users and admins. RLS hides expired
rows immediately. Physical deletion must be performed through the Storage API,
then metadata marked deleted only after success. Never `DELETE` the managed
`storage.objects` rows as a substitute for deleting files. Retention workers
must also process `deleting` rows and orphan/failed reservations, with bounded
batches, retry, monitoring and no automatic re-upload of expired local photos.
`deleted_at` records the first successful deletion and the update trigger keeps
it stable across retries; the worker can reconcile recently deleted paths for
24 hours and rotate by `updated_at` without extending that window. Mark stale
reservations deleting before removing Storage content; a late uploader must not
be allowed to finalize the row and must clean its known object path on failure.

## Rollback plan

This migration has no automatic destructive DOWN migration. In production use
a forward rollback: disable the BFF upload feature, revoke route access, and
leave data/tables intact while diagnosing. This is the safe reversible rollback
for an additive schema and prevents losing the paths needed to remove files.

If an operator explicitly approves complete removal later: first export required
metadata securely, delete physical objects through Storage API, and verify
completion; then author a new numbered migration to remove this bucket's
`egz_private_photo_read` policy, RPC functions, triggers, and EGZ tables in FK
order. Do not drop `auth`, `storage`, unrelated policies, or the bucket as part
of an unreviewed rollback. Disabling the new application alone does not require
deleting any user data or changing existing projects.
