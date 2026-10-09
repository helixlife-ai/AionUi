# Agent Hub v0.2.23-toB — upstream 2.2.2 integration

This deployment pairs AionUi **2.2.2** with AionCore **v0.2.2**. The image tag in
`docker-compose.yaml` and the appliance version in `config.json` must advance
together; updating only the frontend package leaves devices running the old image.
The image must be built and published before distributing this compose file.

## Runtime compatibility

| Component          | Pinned version                | Basis                                      |
| ------------------ | ----------------------------- | ------------------------------------------ |
| AionCore           | v0.2.2                        | `package.json`                             |
| Claude Code        | 2.1.236                       | AionCore v0.2.2 verified CLI contract      |
| Codex              | 0.151.0                       | AionCore v0.2.2 verified CLI contract      |
| Node               | 22.23.1, Debian trixie, ARM64 | Existing appliance SIGILL regression guard |
| Bun (builder only) | 1.3.14                        | Matches the locally validated toolchain    |

The upstream baseline is defined in [AionCore v0.2.2 cli_version.rs](https://github.com/iOfficeAI/AionCore/blob/v0.2.2/crates/aionui-session/src/backend/cli_version.rs).
The image pins those exact verified releases. Local testing additionally checks
our gateway and deployment integration.
This release no longer exports Claude/Codex in `managed-resources`; they run from
PATH. The image therefore installs and executes both pinned CLIs, without the old
bundled-Claude replacement step. The `--allow-dangerously-skip-permissions` flag
must remain distinct from `--dangerously-skip-permissions`: the former enables a
later mode switch without forcing the current session into full-auto mode.

The six `auto-inject` skills are vendored from the same Core release. They include
`conversation-create` and `session-message`, which the previous four-skill image
would omit. The toC curated 92-skill corpus is excluded. Device-owned OpenClaw skills are
linked read-only as in the pre-skills92 release; see [toB device skills](../skills/README.md).
This deployment targets only HLX-AIO-1AE and HLX-AIO-1BE.

## Existing-device upgrade

Back up `/data/aionui-backend.db` and its associated data before upgrading; the new
backend runs database migrations. Rollback requires a matching pre-upgrade data
backup, not only the previous image.

Native CLI session transcripts now persist alongside the database through these
additional mounts:

- `AgentHub/claude-home` → `/root/.claude`
- `AgentHub/codex-home` → `/root/.codex`

For an existing container whose CLI homes are still in its writable layer, stop
it and copy those directories into the new host directories **before** replacing
it. Copy into empty destinations only; do not overwrite existing device data.
The settings/model catalog is refreshed at startup; session files are retained.
The old startup/periodic `acp_session.session_id` clearing has been removed because
native sessions now resume after idle and container replacement.

## Local ARM64 image validation

```sh
docker buildx build --platform linux/arm64 --load --progress plain \
  -t agent-hub:upstream-2.2.2-verified .
node docker/agent-hub/smoke/run.mjs agent-hub:upstream-2.2.2-verified
```

The smoke runner applies the base compose plus the sandbox override and uses
the deployment entrypoint and environment, but replaces
production mounts with a fresh temporary directory, uses a random localhost port,
and routes provider requests to a deterministic local fixture. It does not use
a real device SN, provider credential, Collector, or Studio history server.
Scientific Python dependency installation is excluded from this protocol smoke.

If the build host requires a proxy, pass Docker's `HTTP_PROXY` / `HTTPS_PROXY`
build arguments. `NODE_BUILDER_IMAGE` and `NODE_RUNTIME_IMAGE` can select already
cached Node 22.23.1 ARM64 images when registry authentication is unreachable; record
their immutable image IDs and verify Node's actual version. The production defaults
remain pinned by digest. Optional seeded Core bundles must declare the same version
as `package.json`; stale v0.1.x bundles are rejected.

A successful simulated-provider smoke does not establish that real Helix gateways
or the two TAPD experience defects are fixed. TAPD **1000775** and **1000768** still
require the appliance environment and its actual models.

## Codex nested sandbox on Docker

Codex can answer messages under Docker's default security profile, but
restricted-mode shell tools fail when Bubblewrap cannot create user namespaces.
The profile and local override live in `docker/agent-hub/deployment/`.
The override resolves the profile relative to `aio_deploy/docker-compose.yaml`,
the first compose file. Keep `no-new-privileges` enabled.
No `privileged` mode, `SYS_ADMIN` capability, or forced full-access Codex mode is required.

The profile is vendored from OpenAI's
[codex-security profile](https://github.com/openai/codex-security/blob/c7b028c6d43e4b121072f6b58dca79e49bf8c298/docker/codex-security-seccomp.json)
(retrieved 2026-10-09), licensed under Apache-2.0 (see the repository `LICENSE`).
Its default action denies unlisted system calls. The appliance retains its existing
root runtime and default Docker capability set; unlike the upstream scanner, it
does not switch to a nonroot user with all capabilities dropped.

On hosts with an additional AppArmor restriction on user namespaces, host policy
also needs to permit the nested sandbox. Validate on the target appliance.

For local Docker validation, apply the sandbox override:

```sh
docker compose -f aio_deploy/docker-compose.yaml \
  -f docker/agent-hub/deployment/docker-compose-sandbox.yaml up -d
```

`aio_deploy/` is restricted to `config.json` and `docker-compose.yaml`.
Any appliance provisioning of the seccomp profile must use a separate mechanism
and adjust its host path accordingly. The local override is not part of the
appliance deployment bundle. Do not ship a compose referring to a missing host profile.

The image uses the sandbox helper bundled with the pinned Codex release.
Codex may still emit its missing-system-Bubblewrap notice while selecting the
bundled fallback; execution and write-denial checks verify actual behavior.

`/root/.codex/tmp` is a container-local tmpfs. Only durable Codex configuration
and transcripts live on the host bind mount. On Docker Desktop, keeping temporary
helper locks on VirtioFS allowed another CLI process to remove a live app-server's
arg0 links, causing `Failed to create unified exec process: No such file or directory`.
The smoke fixture now issues a real `exec_command` through the running app-server
after starting another Codex CLI process, guarding this failure path.

## Verified-version validation on 2026-10-09

The deployment pins Claude **2.1.236** and Codex **0.151.0**, matching AionCore
**v0.2.2**. New-conversation checks reject any CLI version-drift notice.

- Built and loaded the Linux ARM64 image locally.
- Native Claude/Codex streamed turns and container-replacement continuation passed.
- Codex sandbox execution and rejection of an `/etc` write passed with the override.
- Live Jova gateway calls using each backend's DeepSeek v4.1 Flash model completed.
- Both backends executed read-only shell commands successfully.
- Live conversations recalled the previous turn after container replacement; native
  session IDs remained unchanged.
- Full frontend tests: 5,280 passed, 5 skipped; lint and TypeScript checks passed.

These checks do not establish all-model coverage or resolve the two TAPD UI
experience defects. Real-appliance regression and its seccomp profile delivery
remain release prerequisites. Test SN values and local credentials are not stored here.

## toB v0.2.23-toB validation

This branch targets only `HLX-AIO-1AE` and `HLX-AIO-1BE`. Both deployment files
use `v0.2.23-toB`; the toC archive and its Docker build stage are removed.
The release notes retain the four user-facing feature summaries from v0.2.23.

Local ARM64 build used cached `node:22-trixie` and `node:22-trixie-slim` after
Docker Hub authentication timed out. Both binaries report Node `v22.23.1`:

- Builder image ID: `sha256:79a67fc841705056e14c6d0500a06e7de9c94ce5c01f8ba8697fd5792301374b`
- Runtime image ID: `sha256:4228fca437e45714a3ebd1d4ecd1dcc583cf79f5a940aa025e286b472d93b67c`

The production Dockerfile retains its pinned digest defaults. The image is
available locally as `agent-hub:v0.2.23-toB` and
`helix-aio.tencentcloudcr.com/application/agent-hub:v0.2.23-toB`; it has not been
published. Reproduce the protocol smoke with:

```sh
node docker/agent-hub/smoke/run.mjs agent-hub:v0.2.23-toB
```

The smoke mounts a read-only OpenClaw fixture and verifies backend discovery,
absence of the toC corpus, six system skills, native CLI versions, sandbox
execution, streaming and conversation continuation after container replacement
against a simulated gateway. Unit tests also cover
missing-source preservation, owned-link pruning and preservation of custom skills.
Full tests: 5,336 passed, 5 skipped; lint, TypeScript, Compose and formatting passed.
Real 1AE/1BE appliance validation remains necessary before distribution.
