# Deployment

## Public browser studio

The default studio provides local capture, preview, PNG downloads and printing
without accounts. Build with Node.js 22+:

```sh
npm ci --ignore-scripts
npm run build
```

Publish **`dist/` only**, over HTTPS. The root `netlify.toml` supplies Netlify's
build command, output directory and function configuration. For another static
host, apply the headers from `config/security-headers.json`; preserve same-origin
model/runtime loading and do not add a catch-all that exposes private paths.
Camera access requires HTTPS, except on supported local development origins.

The default studio needs no account-service credentials. Do not copy local
environment files, photos, operator tools or repository configuration to the
public directory. Build dependencies on the hosting platform rather than
uploading an installed Windows `node_modules/` tree.

## Optional account/archive backend

Backend source is included for self-hosting. It is disabled in the default studio;
removing the frontend guard alone is not a complete backend setup.

Use your own Supabase project and private PNG bucket, review the schema and
authorization fixtures in [supabase/](../supabase/README.md), and configure the
server variables listed in [`.env.example`](../.env.example). Use distinct random
session and retention secrets. Keep privileged keys on the server and separate
production environments from preview deployments.

Set `APP_ORIGIN` to the exact HTTPS origin, with no trailing slash. Use explicit
Auth redirect URLs, require email confirmation, and keep signup disabled until
email delivery and abuse controls are configured. Admin access requires verified
identity, server-side membership and MFA. Preserve RLS, CSRF/origin validation,
PNG limits, rate limits and physical object cleanup.

Before enabling cloud uploads, test isolation between dummy accounts on your own
project, consent withdrawal, expiry and cleanup. Never use visitor photographs as
deployment fixtures. Review [SECURITY.md](../SECURITY.md) and the privacy notice
for your own service configuration.
