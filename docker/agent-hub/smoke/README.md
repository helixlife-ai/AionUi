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
