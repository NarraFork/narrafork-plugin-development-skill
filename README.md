# NarraFork Plugin Development Skill

用于开发、审查和测试 NarraFork 插件的 Claude Skill。它将插件需求转换为与当前 NarraFork 实现兼容、可验证的插件包，并重点检查 Manifest、stdio JSON-RPC、Host API、权限边界、UI bridge 和测试覆盖。

> 本仓库提供的是开发辅助 Skill、参考资料和插件模板，不是 NarraFork 宿主运行时本身。

## 适用场景

当任务涉及以下内容时使用本 Skill：

- NarraFork 插件或 `.nfplugin`
- `manifest.json`、provider、tool、command、event、view contribution
- stdio JSON-RPC、Host API、capability、plugin permission
- provider/search provider、secret、storage、取消和流控
- iframe bridge、Dockview、Plugin UI 生命周期
- 插件升级、回滚、权限审查和 Bun 测试

## 核心原则

1. **先核对当前实现**：区分源码和测试证明的当前事实、设计文档中的目标设计，以及需要产品确认的事项。
2. **通过版本化边界访问宿主**：插件使用 NarraFork RPC 和 Host API，不直接访问宿主数据库或内部 service。
3. **默认限制能力**：不直接使用任意 SQL、HTTP/JWT、React 注入、宿主 DOM、未经限制的文件/进程能力。
4. **可验证交付**：同时提供 Manifest、入口代码、边界适配、纯业务核心和针对非法输入/边界条件的测试。

## 目录结构

```text
.
├── SKILL.md                         # Skill 主说明和工作流
├── evals/evals.json                 # Skill 评测用例
├── references/
│   ├── examples-and-testing.md      # 示例插件和测试矩阵
│   ├── host-api-security.md         # Host API 与安全边界
│   ├── lifecycle-data-model.md      # 生命周期和数据模型边界
│   ├── manifest-rpc.md              # Manifest 与 RPC 约定
│   ├── repository-map.md             # NarraFork 源码位置和事实标签
│   └── ui-bridge-dockview.md        # UI bridge 与 Dockview 约定
└── templates/
    ├── host-api-client/             # Host API 客户端辅助代码
    ├── minimal-backend/              # 最小后端插件模板
    └── tests/                        # Bun 测试模板
```

## 快速开始

### 1. 安装或加载 Skill

将本仓库作为 Claude/NarraFork 的 Skill 使用，并确保 `SKILL.md` 及其 `references/`、`templates/` 目录可访问。

### 2. 先核对宿主仓库

在实现插件前，优先阅读当前 NarraFork 分支中的：

```text
narrafork/server/lib/plugins/manifest.ts
narrafork/server/lib/plugins/protocol.ts
narrafork/server/lib/plugins/permissions.ts
narrafork/server/services/plugin-public-api.ts
narrafork/examples/plugins/provider/manifest.json
```

源码和测试优先于设计文档。设计文档中尚未有对应 schema、migration、service 和测试的内容，不应被描述为已实现能力。

### 3. 使用最小模板

从以下目录复制并按实际 contribution 修改：

```text
templates/minimal-backend/
templates/host-api-client/
templates/tests/
```

典型插件结构：

```text
plugin/
├── manifest.json
├── server/index.js
├── server/lib/rpc.js
├── server/lib/host-api.js
├── server/lib/core.js
└── tests/
```

### 4. 运行测试

插件采用 Bun 时运行：

```bash
bun test path/to/core.test.ts
bun test path/to/e2e.test.ts
```

Skill 本身可使用以下命令验证：

```bash
python C:\Users\17659\.agents\skills\skill-creator\scripts\quick_validate.py .
```

## 安全边界速查

### Manifest 与 RPC

- 使用 `schemaVersion: 1` 和 `narrafork.rpc/1`。
- 后端使用独立进程和 `stdio` transport。
- stdout 只能输出协议帧，普通日志写入 stderr。
- `Content-Length` 必须按 UTF-8 字节数计算。
- 对 header、帧大小、JSON 深度、字符串、队列和并发请求设置上限。
- 未知方法、坏 JSON、超帧、取消和超时必须有明确错误语义。

### Host API 与权限

- 通过 `queries.execute`、`commands.execute`、`storage.*`、`events.*` 等版本化 Host API 访问宿主。
- 插件不能在请求参数中伪造 `pluginId`、用户身份或资源 scope。
- `storage.get` 的 helper 通常返回 `entry.value`，而不是底层 envelope。
- secret 使用 `writeOnly: true` 和 `x-narrafork-secret: true`。
- secret 不得进入普通配置、日志、错误、诊断或测试快照。
- `permissions.network`、`filesystem`、`process` 是策略输入，不等于 OS sandbox。

### UI 插件

- 使用宿主控制的静态 panel adapter，不动态注入 React component、route、renderer 或宿主 DOM。
- iframe 默认使用 `sandbox="allow-scripts"`，不要启用 `allow-same-origin`。
- 使用 host-controlled CSP、`MessageChannel`、一次性 nonce 和 panel session。
- 校验 `source`、消息类型、协议版本、nonce 和 session。
- 不使用任意 `fetch`、宿主 JWT、Cookie、localStorage 或用户可控 CSS。
- 主题只使用宿主公开的语义 token 白名单。
- 每个 panel instance 应拥有独立 runtime、port、权限快照和取消域。

## 推荐测试矩阵

- 合法输入归一化和成功路径
- 缺失字段、额外字段、非法 enum、超长字符串和超大数组
- 重复 activation、重复 command、幂等 key 冲突
- queue overflow、rate limit、cancel、deadline 和未知结果
- UTF-8 Content-Length、多帧、半帧、粘包、坏 header 和坏 JSON
- Host API identity mismatch、unknown method、feature 缺失
- secret 不出现在结果、日志、diagnostic 和 snapshot
- UI nonce/source/protocol 校验、scope、Dockview 恢复、reload/dispose/logout

## 评测

评测用例位于 `evals/evals.json`，覆盖：

1. 最小后端插件、RPC、Host API 和 storage；
2. provider、search provider、secret、取消、超时和模型目录；
3. UI bridge、iframe sandbox、JWT/fetch 清理和 Dockview 生命周期。

建议使用 skill-creator 的评测工具运行并记录：

- 每个断言的通过/失败结果；
- 当前事实、设计目标和待确认项；
- 测试输出路径、环境限制和失败原因；
- with-skill 与 baseline 的对比结果。

## 贡献

提交修改前请：

1. 保持 `SKILL.md` 中的指令与 `references/` 内容一致；
2. 新增或修改模板时同步补充测试；
3. 不把未经源码验证的设计文档内容写成当前能力；
4. 运行 Skill 校验和相关 Bun 测试；
5. 在提交说明中写明影响范围、验证命令和已知限制。

欢迎通过 Issue 或 Pull Request 提交改进建议，尤其是：

- NarraFork 新版本协议变化；
- 新的 Host API 或权限边界；
- provider/UI 的可运行模板；
- 失败案例和回归测试。
