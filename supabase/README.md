# Optional photo archive

The default browser studio stores photos locally and needs no database. This
directory contains the optional Supabase account/archive backend for self-hosters.
Use your own project; no hosted-instance configuration or credentials are supplied.

## Schema

| File | Purpose |
| :-- | :-- |
| `migrations/202610290001_egz_photo_backend.sql` | Sessions, consent, photo metadata, admin membership, RLS and service-only functions |
| `migrations/202610290003_egz_global_photo_counts.sql` | Global admission and retained-object quotas |
| `migrations/202610300004_egz_event_trigger_permissions.sql` | Event-trigger permissions |
| `functions/egz-retention/` | Physical object cleanup through the Storage API |
| `examples/retention-schedule.sql.example` | Instance-specific scheduler template |
| `tests/` | Rollback-only synthetic authorization and quota fixtures |

Before applying the schema to a new test project, create a **private** bucket named
`photo-archive` accepting `image/png`, with a 3 MiB file limit. Review the numbered
migrations and apply them in order with stop-on-error. Existing installations
must use new forward migrations; never edit a previously applied migration.

The scheduler is a separate example because its URL and Vault configuration are
specific to your deployment. Replace `YOUR_PROJECT_REF`, configure the retention
function and Vault secrets, and verify cleanup on dummy objects before scheduling
it. Do not enable cloud uploads without working retention. Applied deployment
records belong to the operator's private configuration, not this public schema.

## Authorization and lifecycle

- Users read their own active consent and visible photos through RLS.
- Admin reads additionally require server-managed membership, consent and MFA.
- Mutating RPCs are service-only. The backend must independently enforce verified
  identity, CSRF/origin checks, byte limits and PNG validation.
- Cloud photos expire after 30 days. Revoking consent closes access and schedules
  deletion. Use the Storage API to remove objects before marking metadata deleted;
  deleting `storage.objects` rows is not a substitute for physical cleanup.
- Retention also reconciles failed reservations and recent deletion tombstones.

Run SQL fixtures only on an isolated project with dummy data. For example:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/authorization.sql
```

The tests roll back their fixtures and do not upload photographs or send email.
They do not replace tests of physical Storage deletion or concurrent requests.
See the [deployment guide](../docs/deployment.md) and [security policy](../SECURITY.md).
