# 示例插件与测试约定

## Provider 示例

`narrafork/examples/plugins/provider/manifest.json` 展示：

- `schemaVersion: 1`、Bun、`narrafork.rpc/1`、`host_api.notifications` 和 `rpc.cancel`；
- provider 静态 capability/limits/model discovery；
- config schema 中 `apiKey` 使用 `writeOnly: true` 与 `x-narrafork-secret: true`；
- provider-settings view 通过 `providerId` 绑定 provider；
- `permissions.host` 只声明 `provider.register`、`provider.use`、`ui.panel`、`config.read_self`；
- network/filesystem/process 描述为宿主策略输入，不等于可直接获得 OS 能力。

## narrator-team 参考插件

`.tmp-narrator-team/narrator-team` 展示更完整的边界分层：

- `server/index.js` 负责生命周期、dispatcher 和业务工具注册；
- `server/lib/rpc.js` 负责 Content-Length framing、pending request、cancel、超时和严格 JSON；
- `server/lib/host-api.js` 负责 query/command/storage/events 的 request envelope 和 HostApiError；
- 业务 core 处理团队状态、队列、幂等投递、裁剪和权限条件；
- `tests/team-core.test.ts` 只测纯业务核心，不依赖真实进程或宿主数据库；
- `tests/e2e.test.ts` 覆盖宿主与插件边界、lifecycle、Host API 和错误路径。

参考时保留其分层思想，不要未经核对复制其中的业务 capability 或内部命名。

## 建议测试矩阵

### 纯核心测试

- 合法输入归一化和结果；
- 空/缺失/额外字段、超长字符串、超大数组、非法 enum；
- 状态转换、重复 activation、重复 command、expectedVersion conflict；
- idempotency key replay 与不同输入冲突；
- queue overflow、rate limit、cancel 和 deadline；
- storage key namespace、quota、list cursor；
- secret 不进入返回值、日志、diagnostic 和 snapshot。

### RPC/Host API 测试

- UTF-8 Content-Length 对中文和 emoji 正确；
- 多帧、半帧、粘包、坏 header、坏 JSON、超帧和 buffer overflow；
- hello identity mismatch、wrong generation、unknown method、feature 缺失；
- `storage.get` helper 返回 `value` 而不是 entry envelope；
- timeout/cancel/unknown result 映射正确；
- stderr 日志不污染 stdout frame；
- cancel 后忽略迟到 response/event。

### UI 测试

- nonce/source/protocol/port 校验；
- sandbox/CSP/asset shell 静态输出；
- panel scope、narrator binding 和 layout restore；
- iframe reload/dispose/disable/logout 时取消请求和订阅；
- overflow 后 query resync；
- token 注入读取 computed style；
- i18n fallback、插值、locale change。

## 运行方式

在仓库采用 Bun 时优先运行：

```bash
bun test path/to/core.test.ts
bun test path/to/e2e.test.ts
```

skill 自身使用 skill-creator 的 `evals/evals.json`、`quick_validate.py`、`aggregate_benchmark` 和 `eval-viewer/generate_review.py`。测试结果要记录通过项、失败项、环境限制和输出路径。
