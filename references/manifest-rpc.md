# Manifest 与 RPC v1 参考

## Manifest 基线

```json
{
  "schemaVersion": 1,
  "pluginId": "com.example.plugin",
  "version": "1.0.0",
  "engine": {
    "runtime": "bun",
    "hostApi": ">=1.0 <2",
    "rpc": "narrafork.rpc/1",
    "features": ["host_api.requests", "rpc.cancel"],
    "runner": "local-process"
  },
  "server": {
    "entry": "server/index.js",
    "transport": "stdio",
    "protocol": "narrafork.rpc/1",
    "args": [],
    "workingDirectory": "package"
  },
  "activationEvents": ["onCommand:example.review"],
  "contributes": { "providers": [], "tools": [], "commands": [], "events": [], "views": [] },
  "permissions": { "host": [], "network": { "mode": "none", "allow": [] }, "filesystem": {}, "process": {} },
  "secrets": [],
  "dependencies": { "plugins": {}, "runtime": {} }
}
```

当前 schema 的关键规则：

- `pluginId` 为小写反向域名；contribution ID 在插件内局部唯一；
- `entry` 和资源路径是包内路径，禁止绝对路径、反斜杠、`.`/`..`、URL scheme、query、fragment 和 `//`；
- `engine.rpc`、`server.protocol` 都必须为 `narrafork.rpc/1`；
- `server.transport` 为 `stdio`；runtime 可为 `bun`、`node`、`python`、`binary`；runner 可为 `local-process`、`podman`；
- `ui.format` 当前为 `iife`，`ui.shell` 为 `host-controlled`；
- provider/search/tool/command/view 的内部引用必须指向存在的 contribution；`searchProviders[].providerId` 必填；
- theme 只能提交结构化、白名单 token 和安全资源路径，不能提交任意 CSS。

## Feature 与 request method

| 请求/能力 | 必需 feature |
|---|---|
| `queries.execute` | `host_api.requests` |
| `commands.execute` | `host_api.requests` |
| `events.subscribe` / `unsubscribe` | `host_api.requests` |
| `events.poll` | `host_api.requests`, `events.poll` |
| `storage.get/set/delete/list` | `host_api.requests` |
| `config.get` | `host_api.requests` |
| `secrets.get/set/delete/list` | `host_api.requests` |
| `diagnostics.getOwn` | `host_api.requests` |
| `$/cancelRequest` | `rpc.cancel` |
| `$/credit` | `stream.credit` |
| Host notifications | `host_api.notifications` |

未知 request method 是 dispatcher error，不是动态扩展点。声明 feature 也不会绕过 grant、canonical adapter、scope、runtime state 或 runner policy。

## Framing

每帧是 UTF-8 字节长度：

```text
Content-Length: 123\r\n
Content-Type: application/json; charset=utf-8\r\n
\r\n
{"jsonrpc":"2.0","id":"1","method":"hello","params":{...}}
```

实现 framing 时限制 header 长度、单帧 bytes、buffer bytes、JSON depth/nodes/string、in-flight requests、queued bytes。stdout 只能放 frame；stderr 才能放日志。

## Lifecycle

```text
plugin starts
  -> hello(pluginId, version, rpcProtocol, features)
  <- initialize(protocol, hostApiVersion, runtimeId, generation, capabilities, limits)
  -> initialized
  <- activate(reason)
  -> activated
  -> healthy (optional/diagnostic)
```

宿主必须比对 Manifest identity 与运行时 hello。旧 generation 的迟到消息必须丢弃。停止/升级时停止新调用、drain/cancel、deactivate、shutdown，超时后才终止进程。

## 错误语义

协议层使用 JSON-RPC error code；业务层使用字符串 code，例如：`INVALID_PARAMS`、`PERMISSION_DENIED`、`NOT_FOUND`、`RATE_LIMITED`、`PAYLOAD_TOO_LARGE`、`TIMEOUT`、`CANCELLED`、`PLUGIN_DISABLED`、`HOST_UNAVAILABLE`、`UNKNOWN_RESULT`、`PLUGIN_BUSY`、`INCOMPATIBLE`、`STORAGE_CONFLICT`、`STORAGE_QUOTA_EXCEEDED`。

有副作用的 command 在 timeout/crash 后可能是 `UNKNOWN_RESULT`，不要自动重放，除非 API 明确支持 idempotency key。
