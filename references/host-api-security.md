# Host API 与安全参考

## Public Query / Command

`plugin-public-api.ts` 当前公共 envelope 使用：

- `schema`: `narrafork.query-request` / `narrafork.command-request`；
- `schemaVersion: 1`；
- `queryId`/`commandId`、`requestId`、`correlationId`、`deadlineAt`；
- command 可带 `idempotencyKey`、`expectedVersion`；
- 结果包含 status、data、redaction、page、asOf/stale、operationId、有限 diagnostics。

Query/Command 注册定义必须声明：

- capability；
- zod input schema；
- redaction；
- resource resolver；
- handler；
- command 的 `sideEffect`、`idempotency`、可选 `requiresAdmin`。

默认公共 API 具有限制：request/response bytes、JSON depth、array length、object keys、string bytes、diagnostics、query/command timeout、cursor TTL、idempotency TTL 和 entry 数。插件不要把这些限制当作可配置的无限预算。

## Capability 不是授权

当前实现把 capability 名称作为格式合法的开放字符串；`KNOWN_CAPABILITIES` 和 `CAPABILITY_TAXONOMY` 主要供文档/UI/补全使用。运行时允许性至少依赖：

```text
manifestRequested
∩ installationGrants
∩ hostPolicy
∩ currentUserAuthority
∩ currentInvocationScope
∩ contributionPolicy
∩ runnerEnforcement
```

另外还要通过 canonical adapter。未知 capability 可以被声明，但没有 adapter 时不能生成有效 grant/运行时授权。grant 是 live revocation state，不能因为“已安装”而默认放行。

不要在新代码中引入 T0–T3、`trustTier`、旧 `theme-only/frontend/backend` 安装门槛或“`*` 等于宿主全部能力”的说明。安装即信任只表示管理员安装是信任决策。

## Secret

- secret API 结构上绑定调用插件，不接收另一个 `pluginId`；
- 普通配置只可返回是否设置、schema 或脱敏摘要；不要返回明文；
- provider config 的 secret 字段用 `writeOnly: true` 和 `x-narrafork-secret: true`；
- 任何 error、diagnostic、audit、stderr、snapshot、测试 fixture 都不能包含 token/password/api key/JWT；
- 单值、总量、key count、写入批次都有上限；批量写入不应默认假设原子；
- `secrets.get` 若为 UI caller 可能需要 admin scope；list/set/delete 应按当前实现再次确认，不要从文档臆测。

## Scope 与身份

宿主生成并绑定 `pluginId`、`runtimeId`、`generation`、`requestId`、principal 和 invocation scope。插件不能在 input 中覆盖 user/project/workspace/chapter/narrator/provider/device 归属。后台 grant 与“代表当前用户”必须分开；不能继承最近一次用户权限。

## 敏感数据与日志

不要返回/记录：JWT、cookie、API key、secret、password、passphrase、system prompt、raw dump、完整 stderr、工作区绝对路径、远端 URL 中的凭据、原始 input/output JSON。记录 plugin/contribution/method/capability/resource、duration、bytes、status 和诊断 ID 即可。

## 运行时权限边界

Manifest 中的 `permissions.network`、`filesystem`、`process` 是声明和策略输入，不是 OS sandbox。必须说明 runner：

- `local-process`：参数数组启动，不经 shell，环境/path allowlist，插件包只读，data/temp 分离；
- `podman`：只有宿主已实现并启用时才能依赖；
- `process.spawn.allowlist`、`network.egress.allowlist`、workspace path 等必须由宿主/runner enforcement 真正实施，不能只写进 manifest。

## 常见反模式

- 直接 import 核心 `db`、Drizzle、内部 service、`eventBus` 或 `ProviderAdapter`；
- 通过 `fetch('/api/...')`、JWT 或 Cookie 绕过 Host API；
- 把 host permission declaration 当成 grant；
- 在日志中打印 secret 或完整 provider response；
- 不分页地返回 chapters/narrators/messages；
- timeout 后重放 non-idempotent command；
- 把 grant 缺失解释为“默认允许”；
- 用 CSS 字符串、selector、`url()` 或用户输入修改宿主 stylesheet；
- 用 allow-same-origin iframe、动态 route、动态 React 注入或隐藏 iframe 作为 UI API。
