#
# AionUi Agent Hub — WebUI 镜像 (linux/arm64)
#
# 打包流程遵循上游 CI（`.github/workflows/pack-web-cli.yml`）：
#   bun install -> electron-vite build (renderer) -> scripts/pack-web-cli.js
# `pack-web-cli.js` 产出自包含 tarball，内含：
#   - aionui-web      (bun 编译的独立二进制，打包了运行时与依赖)
#   - bundled-aioncore/linux-arm64/aioncore
#   - static/         (renderer SPA)

# ---- Builder ---------------------------------------------------------------
# 固定 Node 22.23.1 与镜像 digest，避免可变标签漂移到 ARM64 上会触发
# SIGILL 的 Node 22.23.2 构件。trixie 的 glibc 2.41 也满足 aioncore 要求。
FROM node:22.23.1-trixie@sha256:3145536027ca5268e24654f7efebf1dbdd684cda3708324e6c53f4ad61af8710 AS builder
WORKDIR /app

RUN npm install -g bun

# CI=true 使 postinstall.js 跳过 `electron-builder install-app-deps` 纯 renderer 构建不需要 Electron 原生模块重建。
ENV CI=true
ENV NODE_OPTIONS=--max-old-space-size=8192
# 降级 renderer JS 以兼容 macOS 12 / Safari 15 WebKit（不支持 `static { }` 块）。
ENV AIONUI_RENDERER_TARGET=safari15

# 先拷贝 workspace 清单给 `bun install` 做层缓存，源码变动不会使其失效。
COPY package.json bun.lock ./
COPY patches/ ./patches/
COPY packages/desktop/package.json ./packages/desktop/
COPY packages/shared-scripts/package.json ./packages/shared-scripts/
COPY packages/web-cli/package.json ./packages/web-cli/
COPY packages/web-host/package.json ./packages/web-host/
# postinstall.js 必须在 install 时存在（CI=true 时是空操作，但仍需可加载）。
COPY scripts/postinstall.js ./scripts/postinstall.js
RUN bun install --frozen-lockfile

COPY . .

# 存在预置的 linux-arm64 aioncore bundle 时优先使用（macOS Docker 偶尔装不上
# codex 的 optionalDeps）。先复制到一边，prepareAioncore 会清空目标目录再拷入。
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

# 1) 构建 desktop renderer -> out/renderer（供 web-cli 使用的静态 SPA）
RUN bunx electron-vite build --config packages/desktop/electron.vite.config.ts

# 2) 打包 linux-arm64 的 web-cli tarball（会下载 linux-arm64 的 aioncore）
#    若 GitHub 下载 aioncore 触发限流，通过 --build-arg 传 GH_TOKEN。
ARG GH_TOKEN
RUN PACK_PLATFORM=linux PACK_ARCH=arm64 GH_TOKEN=${GH_TOKEN} node scripts/pack-web-cli.js

# 3) 解压 tarball 到 /out/aionui-web
RUN mkdir -p /out && tar -xzf dist-web-cli/aionui-web-*-linux-arm64.tar.gz -C /out

# ---- Runtime ---------------------------------------------------------------
# 运行时与构建阶段使用同一 Node 补丁版本，并固定多架构镜像 digest。
# Node 仍是必需依赖：Codex 等 ACP CLI 通过 node shebang 启动。
FROM node:22.23.1-trixie-slim@sha256:e6d9a389d34ff9678438af985c9913fbd1eb6ed36e80fea56644f4b4f6dd70ba AS runtime
WORKDIR /app

# libicu76 与 ca-certificates：officecli 预览与 HTTPS 调用。
# python3/pip + poppler-utils：Agent Hub 技能运行时依赖，一体机网络不可靠故构建期打入。
# officecli 同理（运行时自动安装常失败），放 /usr/local/bin 便于 aioncore PATH 查找。
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

# 允许 root 运行时 pip install（trixie 启用 PEP 668，否则拒绝系统级安装）。
# 清华源：一体机通常无法访问 pypi.org；技能脚本首用时会补装依赖。
RUN mkdir -p /root/.config/pip \
    && printf '[global]\nbreak-system-packages = true\nindex-url = https://pypi.tuna.tsinghua.edu.cn/simple\n' \
      > /root/.config/pip/pip.conf

# 全局安装 Claude Code + Codex，使 aioncore 启动时能在 PATH 上自动探测到
# 若不锁版本，每次重建都会使该层失效，即任何应用更新都会强迫用户重拉 600MB。
# 升级 CLI 时显式修改这些 ARG。
ARG CLAUDE_CODE_VERSION=2.1.220
ARG CODEX_VERSION=0.146.0
RUN npm install -g --unsafe-perm \
      @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} \
      @openai/codex@${CODEX_VERSION} \
    && npm cache clean --force

# 禁止Claude Code 自更新
ENV DISABLE_AUTOUPDATER=1

# Studio 历史导入工具(Agent Hub 扩展)。容器启动时由 compose command 调用,
# 从 happy server 拉取并解密该设备 SN 的 Studio 历史会话,导入 aionui-backend.db。
# tweetnacl 装在脚本同级 node_modules,供 ESM import 解析。
COPY scripts/studio-history-import/ /opt/studio-import/
RUN cd /opt/studio-import && npm install --omit=dev tweetnacl && npm cache clean --force

# 一体机全量更新只同步 docker-compose.yaml 到设备 —— 不含 aio_deploy/ 下的其它文件。
# 把 Codex catalog + entrypoint 助手打进镜像，compose 即可直接调用
COPY docker/agent-hub/codex-model-catalog.json /etc/agent-hub/codex-model-catalog.json
COPY docker/agent-hub/js/ /etc/agent-hub/js/
COPY docker/agent-hub/otel/ /etc/agent-hub/otel/

# auto-inject 系统技能（cron/officecli/skill-creator/aionui-config，vendor 自
# aioncore v0.1.53）。容器启动时 build-builtin-skills-hub.js 把它链入组合目录
# /data/builtin-skills-hub，配合 compose 的 AIONUI_BUILTIN_SKILLS_PATH 生效。
# 升级 aioncore 时同步刷新（见 docs/agent-hub-builtin-skills-replacement.md）。
COPY docker/agent-hub/auto-inject/ /etc/agent-hub/auto-inject/

# ARM64 Node 运行时回归检查：v0.2.12 曾在 Dirent 遍历和两个周期任务中
# 触发 SIGILL（退出码 132）。让问题在构建阶段失败，而不是发布后才暴露。
RUN test "$(node --version)" = "v22.23.1" \
    && mkdir -p /tmp/agent-hub-smoke/data/conversations/codex-temp-smoke \
      /tmp/agent-hub-smoke/skills/example \
    && printf '%s\n' '---' 'name: example' 'description: smoke test' '---' \
      > /tmp/agent-hub-smoke/skills/example/SKILL.md \
    && node -e \
      'const fs=require("fs"); const entries=fs.readdirSync("/tmp/agent-hub-smoke/data",{withFileTypes:true}); if(!entries.some((entry)=>entry.isDirectory())) process.exit(1)' \
    && AIONUI_DATA_DIR=/tmp/agent-hub-smoke/data \
      HELIXLIFE_SKILLS_SRC=/tmp/agent-hub-smoke/skills \
      node /etc/agent-hub/js/build-builtin-skills-hub.js \
    && node /etc/agent-hub/js/trust-codex-projects.js \
      /tmp/agent-hub-smoke/config.toml \
    && rm -rf /tmp/agent-hub-smoke

COPY --from=builder /out/aionui-web/bundled-aioncore /app/aionui-web/bundled-aioncore
COPY --chmod=755 --from=builder /out/aionui-web/aionui-web /app/aionui-web/aionui-web
COPY --from=builder /out/aionui-web/package.json /app/aionui-web/package.json
COPY --from=builder /out/aionui-web/static /app/aionui-web/static

ENV AIONUI_PORT=25808
ENV AIONUI_DATA_DIR=/data
ENV AIONUI_ALLOW_REMOTE=1
VOLUME ["/data"]
EXPOSE 25808

CMD ["/app/aionui-web/aionui-web", "start"]
