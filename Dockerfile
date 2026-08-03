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
# trixie = Debian 13, glibc 2.41. aioncore v0.1.41+ requires GLIBC_2.39;
# bookworm (Debian 12, glibc 2.36) cannot run the aioncore binary during
# prepare-managed-resources.
FROM node:22-trixie AS builder
WORKDIR /app

RUN npm install -g bun

# CI=true makes postinstall.js skip `electron-builder install-app-deps` —
# no Electron native rebuild is needed for a renderer-only build.
ENV CI=true
ENV NODE_OPTIONS=--max-old-space-size=8192
# Downlevel renderer JS for macOS 12 / Safari 15 WebKit (no `static { }` blocks).
ENV AIONUI_RENDERER_TARGET=safari15

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

# Prefer a pre-seeded linux-arm64 aioncore+CLI bundle when present. Docker-on-
# macOS sometimes fails optionalDeps for @openai/codex-linux-arm64 during
# prepare-managed-resources. Copy aside first — prepareAioncore clears
# resources/bundled-aioncore/<platform> before copying the local bundle in.
ARG AIONUI_USE_SEEDED_AIONCORE_BUNDLE=0
RUN if [ "$AIONUI_USE_SEEDED_AIONCORE_BUNDLE" = "1" ] \
      && [ -x /app/resources/bundled-aioncore/linux-arm64/aioncore ] \
      && [ -d /app/resources/bundled-aioncore/linux-arm64/managed-resources ]; then \
      mkdir -p /opt && \
      cp -a /app/resources/bundled-aioncore/linux-arm64 /opt/aioncore-linux-arm64-bundle && \
      echo "Seeded aioncore bundle at /opt/aioncore-linux-arm64-bundle"; \
    else \
      echo "No seeded aioncore bundle (will download + prepare)"; \
    fi
ENV AIONUI_BACKEND_LOCAL_BUNDLE_DIR=/opt/aioncore-linux-arm64-bundle

# 1) Build desktop renderer -> out/renderer (static SPA consumed by web-cli)
RUN bunx electron-vite build --config packages/desktop/electron.vite.config.ts

# 2) Pack web-cli tarball for linux-arm64 (downloads linux-arm64 aioncore)
#    Pass GH_TOKEN via --build-arg if GitHub rate-limits the aioncore download.
ARG GH_TOKEN
RUN PACK_PLATFORM=linux PACK_ARCH=arm64 GH_TOKEN=${GH_TOKEN} node scripts/pack-web-cli.js

# 3) Extract tarball to /out/aionui-web
RUN mkdir -p /out && tar -xzf dist-web-cli/aionui-web-*-linux-arm64.tar.gz -C /out

# ---- Runtime ---------------------------------------------------------------
# node:22-trixie-slim = Debian 13 trixie + Node 22 on PATH. glibc 2.41 satisfies
# aioncore v0.1.41+'s GLIBC_2.39 requirement. Node is required at runtime
# because the ACP CLI agents (codex) are JS entry points with
# `#!/usr/bin/env node` shebangs; aioncore detects the CLIs on PATH and
# spawns them. claude-code ships a native binary but shares the PATH.
FROM node:22-trixie-slim AS runtime
WORKDIR /app

# libicu76: officecli (.NET) needs ICU for docx/xlsx/pptx preview (trixie ships libicu76).
# ca-certificates: HTTPS calls to model providers / keybalance / officecli mirror.
# python3/pip + poppler-utils (pdftotext): Agent Hub literature/PDF skills need
# these at runtime; appliance apt/network is unreliable, so bake at image build.
# Bake officecli at build time: Web/appliance preview launches `officecli watch`
# on the server; runtime auto-install often fails on the 一体机 (linux/arm64 +
# flaky GitHub/CDN). Place the binary in /usr/local/bin so aioncore PATH lookup
# works without depending on ~/.local/bin.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libicu76 ca-certificates bubblewrap bash curl \
      python3 python3-pip poppler-utils \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && python3 --version \
    && command -v pdftotext \
    && curl -fsSL https://d.officecli.ai/install.sh -o /tmp/officecli-install.sh \
    && bash /tmp/officecli-install.sh \
    && install -m 755 /root/.local/bin/officecli /usr/local/bin/officecli \
    && /usr/local/bin/officecli --version \
    && rm -f /tmp/officecli-install.sh /root/.local/bin/officecli \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code + Codex globally so aioncore auto-detects them on PATH
# at startup (registered as `source: builtin` ACP agents). Versions resolved
# from npm; pin in package.json if reproducibility is needed.
RUN npm install -g --unsafe-perm \
      @anthropic-ai/claude-code \
      @openai/codex \
    && npm cache clean --force

COPY --from=builder /out/aionui-web /app/aionui-web
RUN chmod +x /app/aionui-web/aionui-web

# Studio 历史导入工具(Agent Hub 扩展)。容器启动时由 compose command 调用,
# 从 happy server 拉取并解密该设备 SN 的 Studio 历史会话,导入 aionui-backend.db。
# tweetnacl 装在脚本同级 node_modules,供 ESM import 解析。
COPY scripts/studio-history-import/import.mjs /opt/studio-import/import.mjs
RUN cd /opt/studio-import && npm install --omit=dev tweetnacl && npm cache clean --force

# Appliance full-update only syncs docker-compose.yaml onto the host — not
# sibling files under aio_deploy/. Bake Codex catalog + entrypoint helpers into
# the image so compose can call them without host bind-mounts. These live
# under docker/agent-hub/ (not aio_deploy/) since aio_deploy/ mirrors exactly
# what the appliance OTA pulls (docker-compose.yaml + config.json).
COPY docker/agent-hub/codex-model-catalog.json /etc/agent-hub/codex-model-catalog.json
COPY docker/agent-hub/js/ /etc/agent-hub/js/

ENV AIONUI_PORT=25808
ENV AIONUI_DATA_DIR=/data
ENV AIONUI_ALLOW_REMOTE=1
VOLUME ["/data"]
EXPOSE 25808

CMD ["/app/aionui-web/aionui-web", "start"]
