# UI bridge 与 Dockview 参考

## 静态 panel adapter

运行期插件不能注册 React component、route 或 renderer。宿主只注册一个静态 `PluginDockPanel` adapter；Manifest 的 view metadata 和可序列化 params 决定实际插件面板。插件缺失、禁用、不兼容或崩溃时仍保留恢复占位和诊断。

focus/workspace/director 都使用同一套 panel/runtime 协议：

- panel params 必须可被 Dockview 序列化；
- `pluginId`、`contributionId`、scope binding 和 component key 由宿主冻结；
- focus 的 narrator/chapter 身份来自当前 live context；
- workspace 多 narrator 必须用明确 `ownerNarratorId`，不能用“最后激活 narrator”；
- 普通拖动、隐藏、tab 切换不应销毁 iframe；panel dispose、route unmount、logout、disable、reload 时关闭 port 并取消未完成请求。

## iframe 与 CSP

默认：

```html
<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" allow=""></iframe>
```

不要加 `allow-same-origin`。host-controlled shell 设置 CSP、准确 MIME、`nosniff`、不可变 hash 路径和自包含资源。默认禁止 forms、popups、downloads、top navigation、clipboard、camera、microphone、geolocation、外部网络和宿主 API fetch。

## MessageChannel 建连

宿主为每个 panel instance 生成随机 `connectNonce`，只在 bootstrap 阶段通过 `postMessage` 转移 `MessagePort`。sandbox iframe 的 `event.origin` 可能是 `null`，因此同时验证：

1. `event.source === iframe.contentWindow`；
2. message type/protocol；
3. connect nonce；
4. session 中绑定的 user/plugin/contribution/panel/surface scope。

建连后移除 window-level listener，后续只使用 port。公共 envelope 只允许 JSON value，便于审计和跨语言 SDK。

## UI API

推荐公开的 host RPC 包括：

- `panel.getState/setTitle/setBadge/setDirty/updateParams/focus/close/open`；
- `context.get/subscribe`；
- `events.subscribe/unsubscribe`；
- `commands.execute`；
- `notifications.show/update/dismiss`；
- `storage.get/set/delete/list`；
- `queries.execute`、`commands.execute`、`backend.call`（仅当前插件自己的 backend）。

插件不能传入/获得 host JWT、宿主 localStorage、Router、QueryClient、DockviewApi、React node、任意 DOM、内部 eventBus 或 service object。

## 主题和 i18n

主题通过宿主注入的 14 个稳定语义 CSS token：body/text/dimmed/surface/border/primary/primary-hover/error/success/warning/font/font-mono/radius/spacing。使用 `var(--nf-color-text, fallback)`，不要依赖 Mantine 全量内部变量。

i18n 词表由插件提供，宿主提供 locale、fallback chain、插值和 `onChange`。英文表必需；缺失 key 返回 key 本身；缺失参数保留 `{name}` 占位符。

## UI 测试重点

- nonce/source/protocol 校验拒绝伪造 bootstrap；
- `allow-same-origin`、任意 fetch、JWT、宿主 DOM/React 注入被静态检查拒绝；
- panel params 恢复不会改变 plugin/contribution/scope/narrator identity；
- panel dispose 会取消请求和订阅；
- event 队列有界，overflow 后通过 query 恢复；
- theme token 与 i18n 的语言/主题切换行为有测试。
