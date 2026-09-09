# 生命周期与数据模型参考

## 当前状态模型

当前权限实现定义：

- desired state：`disabled`、`enabled`、`uninstalling`；
- runtime state：`inactive`、`starting`、`handshaking`、`activating`、`active`、`degraded`、`draining`、`deactivating`、`stopped`、`crashed`、`backoff`、`failed`、`quarantine`；
- compatibility state：`unknown`、`compatible`、`incompatible`。

不要把 `incompatible` 当作管理员主动 `disabled`。期望状态和运行状态分离。

## 目标架构

宿主目标结构是：

```text
Core Process
  ├─ Plugin Manager
  │   ├─ catalog/package store/state/journal
  │   ├─ activation/contribution registry
  │   └─ upgrade/uninstall coordinator
  ├─ Runtime Supervisor
  ├─ Capability Broker / Public Host API
  └─ host-owned provider/tool/command/view proxies

Plugin Process (one plugin per process)
  └─ stdio JSON-RPC
```

设计文档中的 Plugin Manager、journal、runtime lease、package current pointer、plugin storage table 等可能仍是目标设计。写插件代码时不要直接假定这些内部表或 service 已可 import。

## 激活与恢复

- 安装、enable、activate 是不同动作；
- 静态 contribution 从 Manifest 建索引，第一次调用时 single-flight activate；
- activation queue 必须有请求数和字节上限，超限返回 `PLUGIN_BUSY`；
- 每次 spawn 增加 runtime generation，旧进程消息丢弃；
- plugin crash 时在途请求失败，贡献保留为 unavailable，不要静默删除 UI/配置引用；
- restart 使用带抖动的指数退避和预算，超预算 quarantine；
- 只读 query 可由调用方重发；non-idempotent command 默认不自动重放；
- event 默认不跨重启补发，插件应通过 cursor/updatedAt query 对账；
- provider 会话、长流、后台 topic 可持有有期限 lease；普通 command 完成后可 idle stop。

## 升级/卸载边界

目标升级流程：staging → manifest/兼容检查 → upgrading → drain/cancel → 停止旧 runtime → 原子切换 current → 受限 health activation → commit 或 rollback。不要原地覆盖正在运行的版本目录。

卸载流程：拒绝新调用 → drain/cancel/deactivate/shutdown → 撤销 registry/grants/secrets/runtime identity → 删除包/cache → 默认保留 namespaced storage 和缺失引用占位，purge 必须显式。

## 超时与取消

宿主掌握硬 deadline；插件只能更早结束，不能延长。至少区分 spawn、handshake、activation、普通 RPC、首事件、idle、drain、shutdown timeout。取消通过 RPC cancel 下传，迟到 response/event 忽略但可记诊断。背压按 runtime 维护 frame/queue/in-flight/stream/log 预算。
