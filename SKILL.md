---
name: narrafork-plugin-development
description: NarraFork 插件开发与审查工作流。只要用户提到 NarraFork 插件、.nfplugin、manifest.json、provider/tool/command/event/view contribution、stdio JSON-RPC、Host API、capability、plugin permission、iframe bridge、Dockview、插件生命周期、升级/回滚或插件测试，就使用本 skill。它会先核对当前仓库实现，再生成或审查 Manifest、后端运行时、Host API 调用、UI bridge、权限边界和 Bun 测试；即使用户只说“做一个 NarraFork 扩展”或“修复这个插件”，也要主动使用它。
---

# NarraFork 插件开发

## 目标

把插件需求转成与当前 NarraFork 实现兼容的、可验证的插件包。优先保护边界：插件只能通过版本化协议和 Host API 访问宿主，不能 import 核心内部 service、直接 SQL、直接 HTTP/JWT、任意 React 注入或未经限制的网络/文件/进程能力。

## 开始前：先核对事实

在写代码前按顺序阅读相关实现；不要只凭设计文档猜 API：

1. `narrafork/server/lib/plugins/manifest.ts`
2. `narrafork/server/lib/plugins/protocol.ts`
3. `narrafork/server/lib/plugins/permissions.ts`
4. `narrafork/server/services/plugin-public-api.ts`
5. 相关 provider、UI bridge、Plugin Manager、测试文件
6. `narrafork/examples/plugins/provider/manifest.json`
7. `.tmp-narrator-team/narrator-team/manifest.json`、`server/lib/rpc.js`、`server/lib/host-api.js` 和 `tests/`

报告中明确标注：

- **当前事实**：源码或测试直接证明；
- **目标设计**：文档中标为设计建议/假设，尚未必有运行时代码；
- **待确认**：源码与文档冲突、或需要产品选择。

特别注意：`docs/plugin-system/08-data-model-and-core-integration.md` 是目标设计。除非当前分支存在对应 schema、migration、service 和测试，否则不要声称这些数据模型已经可用。

## 设计流程

### 1. 选择 contribution 和执行位置

先确认插件是 server、UI，还是两者都有：

- provider：模型目录、配置校验、chat/generate、流事件和取消；
- search provider：必须通过 `contributes.searchProviders[].providerId` 绑定一个 provider，复用 provider 配置/secret namespace；
- tool：`execution: "server"` 或 `"ui"`，输入 schema 必须有限；
- command：`handler: "server"` 或 `"ui"`，声明 side effect、幂等和 enablement；
- event：白名单 topic、filter、速率和后台策略；
- view：静态声明 entry、surface、scope、instance 和可选 provider 绑定；
- storage/config/secret：只操作本插件的 namespaced 数据。

不要让插件通过动态 JavaScript 注册新的 route、React component、hook、Provider、全局 CSS、Dockview renderer 或任意宿主 callback。

### 2. 编写 Manifest

Manifest v1 的安全基线：

- `schemaVersion: 1`；
- `pluginId` 使用小写反向域名；`version` 使用 SemVer；
- `engine.rpc` 和 `server.protocol` 为 `narrafork.rpc/1`；
- `engine.hostApi` 使用兼容范围；
- `server.entry`、`ui.entry`、style 和资源必须是包内相对路径：使用 `/`，禁止绝对路径、反斜杠、`.`、`..`、URL scheme、query、fragment、网络路径；
- backend 运行在独立进程，`transport: "stdio"`，stdout 只输出协议帧；日志写 stderr 或受控 Host API；
- UI v1 使用 IIFE 和 `shell: "host-controlled"`；
- `activationEvents` 只能使用宿主支持的族：`onStartup`、`onCommand:<id>`、`onView:<id>`、`onProvider:<id>`、`onTool:<id>`、`onEvent:<topic>`、`onSchedule:<id>`；
- `permissions.host` 只表达请求意图，不等于获得运行时授权；实际调用还必须通过 grant、canonical adapter、当前用户/资源 scope、状态和 runner enforcement；
- 请求 Host API 时，在 `engine.features` 声明 `host_api.requests`；调用 `events.poll` 还声明 `events.poll`；取消声明 `rpc.cancel`；流控声明 `stream.credit`；通知声明 `host_api.notifications`；
- provider 的 secret 字段使用 `writeOnly: true` 和 `x-narrafork-secret: true`，不要把秘密当普通 config 返回；
- `permissions.network`、`filesystem`、`process` 是 Manifest 描述，不应被当作完整 OS sandbox；真实隔离取决于 runner 和宿主策略。

当前权限模型没有 T0–T3 trust tier，也没有“声明 capability 就自动获得权限”的语义。安装即信任表示安装是管理员的信任决策，不表示可以绕过 grants、canonical adapter、scope 或 liveness limits。

### 3. 实现 stdio JSON-RPC

使用 `Content-Length` framed JSON-RPC：

```text
Content-Length: <UTF-8 byte length>\r\n
Content-Type: application/json; charset=utf-8\r\n
\r\n
{"jsonrpc":"2.0",...}
```

实现要求：

- 长度按 UTF-8 字节计算，不能按 JavaScript 字符数计算；
- header、单帧、buffer、JSON depth/nodes/string、in-flight 和 queued bytes 都要有限；
- stdout 不得混入调试日志；
- lifecycle 顺序为 `hello → initialize → initialized → activate → activated/healthy`；
- hello 中的 `pluginId`、version、`rpcProtocol`、package digest/feature 必须与宿主安装记录相容；
- 未知 RPC 方法返回 dispatcher error，不要把未知方法当作动态扩展点；
- 父调用取消时发送 `$/cancelRequest`；流必须遵守 `$/credit`；
- provider 只输出受限 provider stream event，不能返回任意 `AgentEvent`，也不能自行执行核心工具。

### 4. 调用 Host API

Plugin → Host 的 v1 请求方法是：

`queries.execute`、`commands.execute`、`events.subscribe`、`events.unsubscribe`、`events.poll`、`storage.get`、`storage.set`、`storage.delete`、`storage.list`、`config.get`、`secrets.get`、`secrets.set`、`secrets.delete`、`secrets.list`、`diagnostics.getOwn`。

调用约束：

- 所有请求使用宿主提供的 plugin/runtime identity 和 invocation scope，插件不能在 params 中改写 `pluginId`、user 或资源归属；
- Query 使用有限输入、分页/游标、`asOf`/`stale` 和 redaction；不要返回 ORM row 或任意 service 对象；
- Command 必须明确副作用：`none`、`idempotent`、`non_idempotent`；有副作用时优先携带 `idempotencyKey`，不要自动重放未知结果；
- `storage.get` 的低层响应通常是 entry envelope，helper 应返回 `entry.value`；写入只接受 JSON value；
- events v1 是 bounded live source + `events.poll`，`snapshot_live` 当前不可用；队列溢出后通过 query/cursor 对账；
- secret API 按调用插件身份命名空间隔离，不能请求其他 pluginId；不要把 secret 放进普通结果、日志、error、诊断或测试快照；
- 错误要保留 code、retryable 和“结果是否未知”的语义；不要把 timeout/cancelled/unknown 全部伪装成可安全重试。

### 5. 实现 UI view

第三方 UI 永远运行在独立 sandbox iframe：

- 默认 `sandbox="allow-scripts"`，不要启用 `allow-same-origin`；
- shell、CSP、asset origin 和 sandbox 属性由宿主控制；禁止远程 script/CDN、任意 fetch 宿主 API、宿主 JWT、Cookie、localStorage、Router、QueryClient、DOM 或 React tree；
- 建连使用 host 生成的一次性 nonce、`MessageChannel` 和 panel session；sandbox 的 `event.origin` 可能是 `"null"`，必须同时校验 source、type、protocol、nonce；
- 每个 panel instance 独立 runtime、MessagePort、权限快照和取消域；Dockview 拖动/隐藏不应无故销毁 iframe；
- panel params 必须可序列化，narrator/workspace scope 以 live context 为真值，不能从恢复的 params 推断另一个 narrator；
- 主题只使用宿主公开的语义 token；不要把任意 CSS、selector、`url()`、`@import` 或用户输入拼进宿主 stylesheet；
- i18n 词表留在插件侧，使用宿主 locale/fallback/interpolation API，语言切换时订阅变化；
- UI handler 不在线时返回 `HOST_UNAVAILABLE`，不要偷偷启动隐藏 iframe。

### 6. 组织业务核心与边界适配

把纯业务逻辑放在独立模块：输入归一化、队列、状态机、幂等、权限条件和数据转换都可脱离 RPC 测试。RPC/Host API 层只负责 framing、schema、身份、错误映射和调用转发。

推荐目录：

```text
plugin/
├── manifest.json
├── server/index.js
├── server/lib/rpc.js
├── server/lib/host-api.js
├── server/lib/core.js
└── tests/core.test.ts
```

不要在 handler 中直接 import NarraFork `db`、Drizzle、内部 `eventBus`、`ToolContext`、JWT 或 `ProviderAdapter`。

## 交付前检查

逐项确认：

- Manifest 校验通过，所有 contribution ID、provider 引用、entry path 和 activation event 都存在；
- feature 与实际 Host API/取消/轮询/credit/notification 请求一致；
- 不存在 T0–T3、旧安装 tier、默认放行、`*` 即可访问内部能力等过时语义；
- 不存在任意 SQL、任意 HTTP/fetch、JWT 注入、secret 回显、无限数组/字符串/日志或未界定的文件/进程访问；
- Query/Command/Storage/Event/Secret 都有输入限制、错误和取消行为；
- provider/search 正确共享 provider config/secret；
- UI 使用静态 panel adapter、sandbox、nonce bridge、scope 和可恢复 params；
- Bun 测试覆盖纯核心成功路径、非法输入、边界、幂等/冲突、队列溢出、取消或未知结果；
- 运行 `C:\Users\17659\.agents\skills\skill-creator\scripts\quick_validate.py` 检查本 skill，按 skill-creator 流程运行 evals 和 `generate_review.py`。

## 输出风格

先给“事实/目标设计/待确认”摘要和文件清单，再给实现。涉及未来设计时明确写“当前分支未发现对应 schema/migration/runtime”。不要用看似完整的模板掩盖尚未落地的宿主能力。