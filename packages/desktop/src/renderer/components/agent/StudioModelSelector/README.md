# Studio Web 模型选择器

仅启用 Claude Code 和 Codex 的 Web 模型选择；Electron、Aion CLI、OpenClaw 保持原有行为。

## 已确认模型合同

`models.json` 是前端展示及镜像目录配置的同一份来源，当前列表与参考倍率是静态配置，不是 KB 在线接口。请求统一使用已核实的 `agenthub-*` ID。

- Claude 和 Codex 均提供 Qwen3.5-Plus、Qwen3.7-Plus、DeepSeek-V4.1-Flash、GLM-5.3、Kimi-K3；均支持 Messages 和 Responses。DeepSeek-V4-Pro 不接入。
- Flash 固定展示。请求 ID 按 Agent 区分：Claude 使用 `agenthub-claude-{模型后缀}`，Codex 使用 `agenthub-codex-{模型后缀}`；后缀为 `qwen3-5-plus`、`qwen3-7-plus`、`deepseek-v4-1-flash`、`glm-5-3`、`kimi-k3`。
- KB 负责计费和扣减；失败不自动切换到 Flash，倍率不参与前端计费。

## 切换与隔离

已有对话选择不同模型时直接发起运行时请求，成功后显示非阻塞通知：缓存可能无法复用、Token 消耗及首轮延迟可能增加，上下文超限时可能压缩历史信息。通知 6 秒后自动关闭，无需确认；失败时仅提示错误并保留原模型。新对话选模型及选择当前模型不显示风险通知。

新对话通过草稿状态写入 `assistant.conversation_overrides.model`，未选择或旧展示 ID 无效时默认 Flash。运行时目录刷新不会把有效业务模型选择重置为 CLI 默认值。

已有对话通过 `useAcpConfigOptions` 按 `conversation_id` 调用配置接口。Claude 沿用 `set_model`，Codex 沿用 `thread/settings/update`，都作用于后续轮次，不改全局环境变量。历史 `agenthub-claude` / `agenthub-codex` 以及不带 Agent 前缀的模型 ID 只做显示兼容，不自动改写保存值；新建会话与主动切换使用当前 Agent 专属 ID。选择已显示为当前模型的选项不触发迁移。KB 仍需保留旧 ID；历史运行时恢复行为需单独联调。运行中禁止切换；配置未就绪或请求失败显示失败，不伪造成功状态。

已知阻塞：当前部署在启动及定时任务中清理旧连接标识，而 AionCore v0.1.53 在没有 `session_id` 时跳过运行时快照，恢复时可能回到创建时的模型。切换结果实际已写入 `acp_session.session_config.runtime.current_model_id`，但这不等于重启恢复已验收。普通会话 PATCH 明确禁止修改模型字段；本实现不绕过该约束。需要修复 AionCore 的无连接标识恢复逻辑后，才能保证完整生命周期的模型持久化。

## 部署

无需修改 AionCore 或新增常驻 Node 服务：

1. Dockerfile 固定 Claude Code 2.1.242，并通过构建期 `pinClaude.js` 同步 AionCore 优先启动的内置 CLI，以支持原生 `modelPicker` 多模型目录。仅升级 PATH 下的 CLI 无效；Rust 二进制不变。
2. 镜像复制本组件的 `models.json` 至 `/etc/agent-hub/models/`。
3. Compose 启动时运行 `docker/agent-hub/models/seed.js`：合并 Claude 模型目录，保留其他设置；基于现有完整模板生成 Codex 五模型目录。重新部署时需要同步更新模型环境变量；尤其应检查外部 `CODEX_MODEL` 覆盖值，默认 Flash 也必须使用对应 Agent 前缀。
4. Node 脚本只在容器启动时执行，不参与请求转发，不在用户切换时重写配置。认证及 Base URL 继续沿用部署环境。

必须同时更新镜像与 Compose；旧运行时未配置目录时，前端展示模型不代表 AionCore 一定允许切换。Codex 各模型暂用现有模板能力元数据，尚待供应商提供真实上下文及推理能力参数。

## 验证边界

单元测试覆盖请求 ID、草稿默认值、协议过滤、失败保留、会话回调隔离、目录初始化和无损配置合并。模拟网关验证客户端发出的模型 ID，不代表 KB 实际路由、工具调用兼容性或计费已验收。真实 KB 联调仍需逐模型验证。
