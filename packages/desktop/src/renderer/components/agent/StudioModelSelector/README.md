# Studio Web 模型选择器

仅替换 Web 输入框中的模型选择交互，Electron 和被屏蔽的 Aion CLI 供应商选择器保持原状。

## 数据与切换

当前 `STUDIO_MODEL_DEMO_ENABLED=true`：新对话与已有对话均按 Agent 展示模型及示例倍率。Claude Code 显示 Qwen3.5-Plus、Qwen3.7-Plus、DeepSeek-V4.1-Flash、GLM-5.3、Kimi-K3 共五款；Codex 排除不支持 Responses 的 GLM-5.3，显示四款。DeepSeek-V4-Pro 已取消接入。默认显示 DeepSeek-V4.1-Flash。选择仅保存在组件按任务和 Agent 隔离的展示状态中，不写入新对话参数，也不调用 Agent 切换接口；弹层明确标注展示模式。页面重新挂载后展示选择恢复默认，不冒充后端持久化。

以下真实切换链路保留在展示开关关闭后的分支中：

- 新对话：复用 `GuidModelSelector` 的运行时模型目录及草稿状态，创建对话时沿用 `assistantOverrides.model`。
- 已有对话：复用 `useAcpConfigOptions` 的当前模型、选项和按 `conversation_id` 隔离的配置接口；不修改全局环境变量。
- 生成中或配置更新中禁用切换；失败保留原模型并提示；切换任务会关闭弹层，忽略前一任务未完成的界面回调。
- 后端返回的模型 ID 原样传递。显示名相同不代表 ID 相同，不把 `opus`、`sonnet` 等别名猜测成公司模型 ID。

## KB 对接边界

组件支持 `rates` 或 `loadRates`，以运行时模型 ID 为键。展示模式使用设计稿示例倍率；真实模式尚未提供 KB 倍率接口，因此显示 `--`。打开弹层获取倍率、失败重试和异常提示已在组件层实现。

后续接入真实目录并关闭展示开关；`withStudioFallback` 在任何模式下都保留且去重 DeepSeek-V4.1-Flash，即使目录为空、请求失败或响应遗漏该模型。保留真实接口返回的 ID，固定兜底显示名称。前端保留入口不等于后端路由可用，需同时确认 KB 兜底模型映射。

本次不实现计费、API Key/Base URL 修改、AionCore 构建或新的 Node 服务。前端按任务路由的测试不等同于真实 Agent/KB 端到端切换验收；仍需验证目标模型兼容性、恢复对话后的实际模型以及跨任务隔离。

## 验证

新增组件、倍率与 Web 集成测试位于 `tests/unit/agent-hub/studioModel*.test.ts*`，覆盖原始 ID 传递、禁用态、接口失败、倍率降级、任务隔离和 Aion CLI 保持屏蔽。
