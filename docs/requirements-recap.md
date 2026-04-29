# NetScope 第一版需求结论汇总

## 1. 产品定位

NetScope 第一版是一个公开发布到 GitHub 的 Flutter 调试工具产品，核心目标是：

- 面向 Flutter `Dio`
- 面向 `debug` 真机调试
- 基于代码层采集请求/响应
- 通过 macOS 本地 CLI + Web UI 展示

它不是：

- 代理抓包工具
- 系统级全流量抓包工具
- Charles / Proxyman 的替代品

README 必须明确写出：

- 这是 Dio 应用层抓包
- 只能覆盖经过 Dio interceptor 的请求
- 不覆盖 WebView、原生层、其他未接入 Dio 的流量

---

## 2. 第一版边界

第一版只支持：

- Flutter
- Dio
- debug 模式
- 真机调试
- macOS 开发机
- 单设备
- 单 CLI 实例
- 单当前会话

第一版明确不做：

- Mock
- 代理模式
- 证书方案
- 多设备并发
- 多项目隔离
- Windows / Linux
- profile / release
- 非 Dio 自动支持
- 旧 HTTP 上报方案
- 旧 Flutter WebSocket 直连方案
- 旧多链路并存方案

---

## 3. 接入体验

第一版 SDK 接入目标：

- 1 到 3 行接入
- 不修改业务请求代码
- 不配置代理
- 不安装证书

公开接入 API 保持极简，形态类似：

```dart
dio.interceptors.add(NetScope.createInterceptor())
```

或：

```dart
dio.interceptors.add(NetScope.createInterceptor(enabled: kDebugMode))
```

SDK 对外只保留：

- 安装 Dio interceptor
- `enabled` 开关

SDK 不暴露：

- `serverHost`
- `serverPort`
- body 大小上限
- 存储策略
- UI 策略
- 容量策略
- 诊断缓冲策略

`enabled` 默认行为：

- debug 下默认 `true`
- 非 debug 下默认 `false`
- 允许显式覆盖

---

## 4. 采集与传输主链路

第一版最终路线已经确定为：

`Dio 代码层采集 + flutter run 调试链路回传 + CLI/Web UI 展示`

这意味着：

- 真机不会主动把抓包数据通过 HTTP 发回桌面
- 桌面端通过 Flutter 调试 URI 读取 NetScope 事件
- SDK 只负责在代码层产生日志/事件
- CLI 负责连接调试会话并消费事件

第一版依赖：

- `flutter run`
- 调试 URI

第一版不再走：

- 代码里填写桌面 `host/port`
- 真机 HTTP 上报桌面
- 真机 WebSocket 直连桌面

---

## 5. 调试 URI 与启动流程

第一版启动流程固定为三步：

1. `flutter run` 启动真机调试
2. 执行 `netscope` 启动本地服务和 Web UI
3. 将调试 URI 粘贴到 CLI，完成连接

第一版 `netscope`：

- 不接管 `flutter run`
- 不强做自动发现 URI
- 以手工粘贴 URI 为主路径
- 同时允许命令参数传入 URI 作为补充能力

CLI 启动后：

- 立即打开 Web UI
- 页面进入“等待连接”状态
- 等待用户在终端粘贴 URI

连接成功后：

- 不再接受新的 URI
- 不允许切换调试目标
- 但 CLI 仍保留普通命令输入能力

如需连接新目标：

- 重启 `netscope`

---

## 6. CLI 产品形态

最终成品是可全局安装到 `bin` 的 CLI 工具。

第一版 CLI 默认职责：

- 启动本地服务
- 打开 Web UI
- 接收调试 URI
- 连接 Flutter 调试会话
- 展示最小状态信息
- 提供最少命令

第一版 CLI 高级参数尽量少，例如：

- `--port`
- `--no-open`
- `--db`
- `--uri`

---

## 7. CLI 状态显示

第一版只展示三个核心状态：

- 服务已启动
- 已附着调试链路
- 已检测到 SDK 事件

这三个状态按严格递进关系展示：

1. 服务启动后，才可能附着调试链路
2. 附着调试链路后，才可能检测到 SDK 事件

“已检测到 SDK 事件”的成立条件：

- 收到任意合法 NetScope 事件即可
- 不要求必须先收到业务请求

第一版不展开复杂诊断树。

---

## 8. CLI 交互命令

连接成功后，CLI 继续保留命令输入能力，但只保留极少数命令。

已确认命令集：

- `clear` / `-c`：清空当前会话请求
- `status` / `-s`：查看当前状态
- `help` / `-h`：查看命令
- `exit` / `-e`：退出 CLI
- `max-messages <n>` / `-mm <n>`：设置最大保留条数
- `body-limit <n>` / `-bl <n>`：设置文本 body 大小上限

命令规则：

- 提供完整拼写
- 提供短缩写

配置行为：

- `-mm` 和 `-bl` 属于 CLI 本地偏好配置
- 配置保存在 CLI 本地，不写入项目仓库
- 修改后下次启动生效
- 每次启动时主动显示当前配置值

---

## 9. Web UI 最小目标

第一版 Web UI 只做最小可用调试面板，必须包含：

- 请求列表
- 详情面板
- 顶部状态区
- 基础过滤
- 清空当前会话

请求列表至少展示：

- 时间
- method
- host/path 或 url 摘要
- status
- duration
- 状态标识（pending / complete / failed / incomplete）
- 截断或大文件提示

详情面板采用固定区块，不做复杂 tab：

- General
- Request Headers
- Request Body
- Response Headers
- Response Body
- Diagnostics

---

## 10. Web UI 数据行为

### 列表行为

- 默认按 `request_started.timestamp` 倒序
- 请求状态更新时行位置不变，只刷新内容
- 选中请求后，详情随同一 `requestId` 增量刷新

### 请求生命周期

- 只有完整收到 `request_started` 后才在列表创建记录
- 若仅收到 started 分片但未完成重组，先留在内部缓冲，不污染 UI
- `request_finished` 或 `request_failed` 可能乱序先到，允许内部缓存等待 started
- 对等待配对的乱序事件设置超时，超时后转为诊断错误并清理

### 状态语义

- `pending`：已收到 started，等待 finished/failed
- `complete`：已完整收到成功结束事件
- `failed`：已完整收到失败事件
- `incomplete`：started 已成立，但后续事件缺失或重组失败

如果一条 started 后续没有收到 finished/failed：

- 保留该记录
- 状态显示为 `pending` 或 `incomplete`
- 在 Diagnostics 中提示缺失后续事件

---

## 11. 数据存储与会话

第一版只保留当前 CLI 活跃期内的数据。

具体规则：

- CLI 存活期间，页面刷新后可以恢复当前会话数据
- CLI 终止后，再打开页面看不到旧数据
- 不做历史 session 产品能力
- 不做跨 session 回看

数据库存在的目的不是“历史查看”，而是：

- 防止纯内存过大
- 支撑当前活跃会话内的页面刷新恢复

页面必须提供显式“清空”功能。

---

## 12. 容量与保留策略

第一版需要明确容量上限。

当前结论：

- 默认最大请求数建议为 `1000`
- 支持通过 CLI 配置修改
- 当前修改下次启动生效

超过上限后的策略：

- 当前内存实时视图只保留上限内的数据
- 更旧的数据进入内部存储缓冲
- 这些旧数据不作为“历史能力”对外承诺

---

## 13. 事件协议原则

第一版不把 NetScope 事件当普通日志，而是当结构化协议处理。

协议要求：

- 有明确 NetScope 标识
- 有稳定 schema
- 有 `protocolVersion`
- 有 `sdkVersion`
- 支持分片
- 支持重组

桌面端只消费带明确 NetScope 标识的事件，忽略其他 Flutter 普通日志。

---

## 14. SDK 内部结构

SDK 内部职责拆分已确定：

- `interceptor`：采集 Dio 请求/响应/错误
- `encoder`：标准化、裁剪、分片
- `sender`：把结构化事件写入调试链路

原则：

- 不依赖 Dio 原始对象随手序列化
- 不依赖单条日志承载完整数据
- 协议 schema 由 NetScope 显式定义

---

## 15. 桌面端内部结构

桌面端也应拆层：

- `transport reader`：连接调试 URI，读取原始调试事件
- `event assembler`：过滤 NetScope 事件、重组分片、合并 request 生命周期、产出 UI 状态

桌面端只围绕：

- 当前 session
- 当前设备
- 当前请求流

构建状态。

---

## 16. 事件类型

第一版核心事件类型已确定为：

- `device_ready`
- `request_started`
- `request_finished`
- `request_failed`

这意味着：

- `request_started` 建立请求记录
- `request_finished` 补全成功响应
- `request_failed` 补全失败信息

失败请求也必须进入列表。

---

## 17. requestId 规则

每次请求的 `requestId` 由 SDK 在请求发出前生成。

同一 `requestId` 用于关联：

- started
- finished
- failed
- 相关分片

服务端不做 URL 或时间猜配对。

---

## 18. Body 策略

第一版只对“适合文本展示”的 body 做采集展示。

文本类型按 `content-type` 保守判断：

- `application/json`
- `text/*`
- `application/x-www-form-urlencoded`

其余内容按非展示内容处理。

策略如下：

- 文本类 body：按大小上限采集，超限标记为截断
- 图片 / 文件 / 二进制 / 大内容：不回传原始内容
- 对大内容只保留元信息和占位提示

展示的元信息至少包括：

- `content-type`
- `size`
- 是否为二进制/大文件
- “未展示原始内容”提示

文本 body 上限由 CLI 本地配置控制。

---

## 19. Header 策略

第一版请求头和响应头：

- 全量保留
- 不做复杂筛选
- 不做默认脱敏

原因：

- 主要用于开发者本地调试
- header 调试价值高
- 第一版优先简单直接

但文档需提醒：

- 不适合直接用于敏感生产环境排查

---

## 20. Diagnostics 要求

详情页 `Diagnostics` 区块至少展示：

- `requestId`
- 是否分片
- body 是否截断
- 是否被判定为大文件/二进制
- 采集异常
- 重组异常
- 后续事件缺失

当前选中的请求一旦出现重组失败或缺失，应在详情里显著提示。

---

## 21. 原始事件诊断缓冲

桌面端应保留一个轻量原始事件缓冲，用于排查：

- 协议解析问题
- 分片问题
- 重组问题

规则：

- 只保留最近少量
- 只在内存中保留
- 不落库

---

## 22. 验收标准

第一版验收只看主链是否可靠，不看功能是否多。

硬性验收项：

1. `flutter run` 后，`netscope` 能正常启动服务并打开 Web UI
2. CLI 可以接受 URI 并附着调试链路
3. CLI / Web UI 能显示三段核心状态
4. 安装 SDK interceptor 后，CLI 能检测到合法 NetScope 事件
5. 发起 Dio 请求后，Web UI 能稳定显示列表和详情
6. 连续多次请求时不随机丢包，不依赖频繁重启或刷新才能恢复
7. `clear`、`status`、`help`、`exit`、`-mm`、`-bl` 命令行为符合预期

---

## 23. 当前文档基线

当前文档基线应以本文件为准。

旧的：

- 旧 Phase 文档
- 旧 HTTP 上报文档
- 旧 VM / WebSocket 混合方案文档

已经废弃，不再作为第一版依据。
