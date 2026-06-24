#
# AionUi Agent Hub — WebUI image (linux/arm64)
#
# Built inside a linux/arm64 container. On Apple Silicon Docker Desktop this
# runs natively (no qemu), and the resulting image is directly usable on any
# linux/arm64 host (e.g. the 一体机).
#
# Packaging follows the upstream CI flow (`.github/workflows/pack-web-cli.yml`):
#   bun install -> electron-vite build (renderer) -> scripts/pack-web-cli.js
# `pack-web-cli.js` produces a self-contained tarball with:
#   - aionui-web      (bun-compiled standalone binary, bundles runtime + deps)
#   - bundled-aioncore/linux-arm64/aioncore
#   - static/         (renderer SPA)
#
# This replaces the previous Dockerfile which referenced non-existent
# `build:renderer:web` / `scripts/build-server.mjs` scripts and could not build.

# ---- Builder ---------------------------------------------------------------
FROM node:22-bookworm AS builder
WORKDIR /app

RUN npm install -g bun

# CI=true makes postinstall.js skip `electron-builder install-app-deps` —
# no Electron native rebuild is needed for a renderer-only build.
ENV CI=true
ENV NODE_OPTIONS=--max-old-space-size=8192

# Copy workspace manifests first so `bun install` can resolve workspace:* deps.
# Layer-caches the heavy install; source changes below don't invalidate it.
COPY package.json bun.lock ./
COPY patches/ ./patches/
COPY packages/desktop/package.json ./packages/desktop/
COPY packages/shared-scripts/package.json ./packages/shared-scripts/
COPY packages/web-cli/package.json ./packages/web-cli/
COPY packages/web-host/package.json ./packages/web-host/
# postinstall.js must exist at install time (CI=true makes it a no-op that
# skips electron-builder, but it still has to be loadable).
COPY scripts/postinstall.js ./scripts/postinstall.js
RUN bun install --frozen-lockfile

COPY . .

# 1) Build desktop renderer -> out/renderer (static SPA consumed by web-cli)
RUN bunx electron-vite build --config packages/desktop/electron.vite.config.ts

# 2) Pack web-cli tarball for linux-arm64 (downloads linux-arm64 aioncore)
#    Pass GH_TOKEN via --build-arg if GitHub rate-limits the aioncore download.
ARG GH_TOKEN
RUN PACK_PLATFORM=linux PACK_ARCH=arm64 GH_TOKEN=${GH_TOKEN} node scripts/pack-web-cli.js

# 3) Extract tarball to /out/aionui-web
RUN mkdir -p /out && tar -xzf dist-web-cli/aionui-web-*-linux-arm64.tar.gz -C /out

# ---- Runtime ---------------------------------------------------------------
# node:22-bookworm-slim = debian bookworm + Node 22 on PATH. Node is required
# at runtime because the ACP CLI agents (codex, openclaw) are JS entry points
# with `#!/usr/bin/env node` shebangs; aioncore detects the CLIs on PATH and
# spawns them. claude-code ships a native binary but shares the PATH.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# libicu72: officecli (.NET) needs ICU if document preview is used.
# ca-certificates: HTTPS calls to model providers / keybalance.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libicu72 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install the three CLI agents globally so aioncore auto-detects them on PATH
# at startup (registered as `source: builtin` ACP agents). Versions resolved
# from npm; pin in package.json if reproducibility is needed.
RUN npm install -g --unsafe-perm \
      @anthropic-ai/claude-code \
      @openai/codex \
      openclaw \
    && npm cache clean --force

COPY --from=builder /out/aionui-web /app/aionui-web
RUN chmod +x /app/aionui-web/aionui-web

ENV AIONUI_PORT=25808
ENV AIONUI_DATA_DIR=/data
ENV AIONUI_ALLOW_REMOTE=1
VOLUME ["/data"]
EXPOSE 25808

CMD ["/app/aionui-web/aionui-web", "start"]
