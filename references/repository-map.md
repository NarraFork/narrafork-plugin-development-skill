# NarraFork 插件仓库地图

## 当前实现入口

| 主题 | 路径 | 结论 |
|---|---|---|
| Manifest schema | `narrafork/server/lib/plugins/manifest.ts` | 当前实现；schema/version/path/contribution 校验在这里 |
| RPC 常量与 envelope | `narrafork/server/lib/plugins/protocol.ts` | 当前实现；`narrafork.rpc/1`、lifecycle、Host request method、feature parity、provider event |
| Capability 与 lifecycle schema | `narrafork/server/lib/plugins/permissions.ts` | 当前实现；无 T0–T3，capability 是格式合法的开放字符串 |
| Public Query/Command API | `narrafork/server/services/plugin-public-api.ts` | 当前实现；输入/结果 schema、limits、pagination、redaction、idempotency、audit |
| Host 架构目标 | `narrafork/docs/plugin-system/02-host-architecture.md` | 多数是设计建议/假设；不可当作已存在代码 |
| UI bridge 目标/实现说明 | `narrafork/docs/plugin-system/05-ui-bridge-and-dockview.md` | 混合当前事实和目标设计；逐段查看标记 |
| Data model integration | `narrafork/docs/plugin-system/08-data-model-and-core-integration.md` | 目标设计；除非存在对应 migration/service/test，否则不要宣称已落地 |
| Capability policy | `narrafork/docs/plugin-system/11-capability-policy.md` | 权限取舍记录；已移除 trust tier |
| Provider 示例 | `narrafork/examples/plugins/provider/manifest.json` | 当前示例；provider config、write-only secret、provider view、features |
| 参考插件 | `.tmp-narrator-team/narrator-team/` | 参考源码；RPC/Host API/业务核心/测试分层 |

## 修改前检查

1. 在当前 branch 搜索同名 method/field；
2. 阅读对应测试，确认是运行时契约还是设计草案；
3. 复核 `origin/main` 差异时只用于上下文，不覆盖用户工作区；
4. 忽略 `.tmp-fix45-current/` 和 `.tmp-fix45-verify/` 等无关临时目录；
5. 若远程不可达，记录本地核对范围，不把远程状态当成事实。

## 设计标签

- `[当前事实]` / `[事实]` / `[已实现]`：可以直接用于代码和模板；
- `[设计建议]` / `[建议]` / `[假设]`：只能用于目标方案，输出时标明未必落地；
- `[待决策]`：不要替用户选择隐藏在模板里。
