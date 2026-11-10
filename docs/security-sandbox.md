# Isolated security fixtures

The `security-sandbox` GitHub Actions job uses a disposable Ubuntu runner and a
digest-pinned official Node image. It does not require WSL/Docker installation on
the developer's Windows computer. This is an audit environment, not an additional
production service or a change to visitor authentication.

Provisioning happens before isolation: Actions obtains the existing lockfile
dependencies with lifecycle scripts disabled and pulls the fixed toolchain image.
The audit process itself cannot install dependencies or fetch network resources.
The checkout token is not persisted and no repository/provider secrets are passed
to the container. Only selected tracked source files, read-only dependencies and
an empty scratch filesystem are mounted. `.git`, local credentials, photographs,
the host home, Docker socket and production services are not exposed.

## Enforced controls

- Separate network namespace with only isolated loopback; no external network.
- Non-root UID 65534, all capabilities removed, no privilege escalation and the
  default Docker seccomp filter. Neither privileged nor host-network mode is used.
- Read-only root, source and toolchain. Writable scratch is a 128 MiB tmpfs with
  `noexec,nosuid,nodev`; home, temporary files and caches live inside it.
- Empty process environment with six explicit safe values, no real API keys.
- One CPU, 512 MiB memory without swap, 64 tasks, 8 MiB maximum file size,
  128 descriptors, zero core dumps, 60 CPU seconds per process, and a 180-second
  parent wall-clock deadline. Timeout/failure removes the entire container.

The launcher checks Docker configuration before starting. The in-container probe
checks kernel limits, read-only mounts, environment, seccomp, dropped privileges,
scratch size and an externally unroutable connection before executing any target
tests. Missing controls fail the job; there is no unsandboxed fallback.

The fixtures cover encrypted/expired sessions, CSRF/origin checks, anonymous
private/admin access, rate-limit outages, form/body limits, malformed and oversized
PNGs, metadata/payload removal, safe error logging, the Netlify adapter, and real
HTTP traffic confined to the container's loopback. They use dummy identities and
synthetic images. They do not contact Supabase or the deployed website.

## Evidence and scope

Only `result.json` (maximum 1 MiB total) can be retained. Before execution, the
trusted launcher opens non-inheritable descriptors for scratch and a separate
parent-only artifacts directory. After all container processes terminate, it
reads the exact allowlisted file using directory-relative no-follow/nonblocking
APIs, checks regular-file type, single-link count, size and unchanged identity,
then creates the destination exclusively. The target cannot write the destination.
Regression tests reject symlinks, hard links, FIFOs, oversized files, traversal
and overwrites. Raw target directories are never copied back.

These fixtures cover the listed local API boundaries. A passing job does not
establish a full penetration test or validate a deployed database's authorization
policies. Test those separately on an isolated instance with dummy principals.

References: [Docker network isolation](https://docs.docker.com/engine/network/drivers/none/),
[resource limits](https://docs.docker.com/engine/containers/resource_constraints/),
[seccomp](https://docs.docker.com/engine/security/seccomp/), and
[GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).
