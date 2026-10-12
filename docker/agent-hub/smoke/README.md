# Image smoke fixture

Run from the repository root:

```sh
node docker/agent-hub/smoke/run.mjs [local-image-tag]
```

`run.mjs` starts only its uniquely named disposable container. It generates fresh
mount directories, reads the real deployment command through `docker compose
config` with the sandbox override, and retains diagnostics in the printed temporary directory. It removes
its own container on completion and never uses the appliance's existing storage.

`gateway.mjs` implements small deterministic Anthropic Messages and OpenAI
Responses streaming fixtures for runtime contract tests. It is not a model server
and must not be used to measure output quality or real streaming smoothness.

The runner checks Codex sandbox write restrictions and executes a deterministic
read-only command through the native app-server after another CLI process starts.
This covers temporary helper cleanup on Docker Desktop shared filesystems.

It also checks all five configured models on both backends: the runtime must
advertise each ID, acknowledge a switch as observed, and use that ID in its next
gateway request. The same checks run again after container replacement to cover
historical conversation restoration. Newer-version diagnostic records are allowed;
they are hidden by the Studio conversation UI, not removed from the backend.

The Codex history recovery fixture deliberately replaces only its isolated native
anchor with a nonexistent thread ID. It checks real model-switch confirmation,
unchanged Studio message rows, and the historical text and attachment path in the
next Responses request. The deployment-owned stdio adapter restores visible
messages and tool records as context without replaying tools; healthy native
resumes pass through unchanged. Fresh native threads are persisted even before
the first model turn, so an idle restart does not leave an unusable anchor.

To test the adapter against an existing image before rebuilding it:

```sh
STUDIO_SMOKE_CODEX_BRIDGE=1 node docker/agent-hub/smoke/run.mjs [local-image-tag]
```

This mounts only the repository's adapter files into the disposable test container.
