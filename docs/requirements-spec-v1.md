# NetScope V1 详细需求文档

## 1. 文档目标

本文档用于指导 NetScope 第一版的开发、安装、测试和验收。

目标是让开发者仅依赖本文件即可完成以下工作：

- 明确第一版范围
- 理解产品行为
- 实现核心模块
- 安装本地 CLI
- 接入 Flutter 示例
- 完成联调和验证

本文档面向第一版，不讨论后续增强版路线。

---

## 2. 产品定义

NetScope V1 是一个面向 Flutter `Dio` 的调试工具。

开发者在 Flutter debug 真机调试时，为 Dio 安装 NetScope interceptor。SDK 在代码层采集请求生命周期事件，通过 Flutter 调试链路回传给 macOS 桌面端。桌面端 CLI 连接调试 URI，解析事件，并通过本地 Web UI 实时展示请求列表和详情。

### 2.1 V1 核心价值

- 代码层抓包，无需代理
- 无需 HTTPS 证书
- 接入简单，1 到 3 行
- 面向真机 debug 场景
- 实时查看请求和响应

### 2.2 V1 非目标

- Mock
- 代理抓包
- 系统级全流量抓包
- 多设备会话
- 多项目会话
- 跨 session 历史查看
- Windows / Linux 支持
- 非 Dio 自动支持

---

## 3. 用户角色与使用场景

### 3.1 目标用户

- Flutter 开发者
- 使用 Dio 发起网络请求
- 在 macOS 上进行真机调试

### 3.2 典型使用场景

1. 开发者通过 `flutter run` 启动真机 debug
2. 运行 `netscope`
3. Web UI 自动打开
4. 将 Flutter 调试 URI 粘贴到 CLI
5. CLI 显示已附着调试链路
6. 开发者在 App 中触发 Dio 请求
7. Web UI 中出现请求列表和详情

---

## 4. 产品范围

### 4.1 平台范围

- 开发机：macOS
- App 端：Flutter debug 真机
- 网络库：Dio

### 4.2 会话范围

- 一个 CLI 实例对应一个当前会话
- 一个当前会话只服务一个当前调试目标
- 不支持运行中切换 URI
- 如需切换目标，重启 `netscope`

### 4.3 数据保留范围

- 只保留当前 CLI 活跃期的数据
- CLI 活跃期间页面刷新可恢复
- CLI 终止后不保留用户可见历史数据

---

## 5. 总体架构

## 5.1 总体链路

```text
Flutter App (debug, Dio)
  -> NetScope interceptor
  -> encoder
  -> sender
  -> Flutter 调试链路事件流
  -> CLI transport reader
  -> event assembler
  -> in-memory current session state
  -> local buffer storage
  -> HTTP API + WebSocket
  -> Web UI
```

### 5.2 模块划分

Monorepo 建议包含：

- `packages/dart-sdk`
- `packages/server`
- `packages/web`
- `packages/shared`
- `packages/example`

---

## 6. SDK 需求

### 6.1 公开 API

SDK 对外只提供极简接入接口。

推荐形式：

```dart
dio.interceptors.add(NetScope.createInterceptor())
```

或：

```dart
dio.interceptors.add(NetScope.createInterceptor(enabled: kDebugMode))
```

### 6.2 公开配置

V1 只允许一个公开配置项：

- `enabled`

默认行为：

- debug：默认启用
- 非 debug：默认禁用

### 6.3 内部结构

SDK 内部至少分为三层：

- `interceptor`
- `encoder`
- `sender`

职责如下：

#### interceptor

- 监听 Dio request/response/error
- 在请求发出前生成 `requestId`
- 提取原始请求/响应字段

#### encoder

- 将 Dio 数据映射为稳定协议结构
- 根据 content-type 判断 body 是否可展示
- 对文本 body 执行大小裁剪
- 对大内容生成占位信息
- 在必要时分片

#### sender

- 将编码后的结构化记录写入 Flutter 调试链路
- 不承担数据抽取与裁剪逻辑

### 6.4 事件类型

SDK 需要产出以下事件：

- `device_ready`
- `request_started`
- `request_finished`
- `request_failed`

### 6.5 requestId 规则

每个请求都必须在请求发出前生成唯一 `requestId`。

同一 `requestId` 用于关联：

- request_started
- request_finished
- request_failed
- 事件分片

### 6.6 body 策略

#### 文本类内容

按 `content-type` 视为可展示文本：

- `application/json`
- `text/*`
- `application/x-www-form-urlencoded`

文本 body：

- 允许采集
- 受 body size limit 限制
- 超限要标记为截断

#### 非文本类内容

以下内容不回传原始内容：

- 图片
- 文件
- 二进制
- 其他大内容

仅保留：

- content-type
- size
- binary/file 标记
- 未展示原始内容提示

### 6.7 header 策略

- 请求头全量保留
- 响应头全量保留
- V1 不做默认脱敏

### 6.8 SDK 验证点

- 未接入 interceptor 时不产出 NetScope 事件
- 接入 interceptor 后能产出合法事件
- enabled=false 时不产出事件
- request_started 与 request_finished 能按 requestId 配对
- request_failed 能进入链路
- 大 body 能正确截断或转为占位

---

## 7. 调试链路与协议需求

### 7.1 调试链路

V1 使用 Flutter 调试 URI 连接调试会话。

CLI 负责：

- 附着调试 URI
- 读取调试事件
- 过滤 NetScope 协议事件

### 7.2 协议字段要求

每条 NetScope 事件至少应包含：

- `protocolVersion`
- `sdkVersion`
- `eventType`
- `requestId`（device_ready 可不带）
- `timestamp`
- `chunk metadata`（如分片）
- `payload`

### 7.3 分片要求

当单条事件内容过大时：

- encoder 必须拆分为多个结构化记录
- assembler 必须支持重组

要求：

- 不依赖单条日志承载完整 JSON
- 分片必须有稳定顺序信息
- 分片失败要能转为诊断

---

## 8. CLI 需求

### 8.1 启动方式

V1 启动流程：

1. 用户运行 `flutter run`
2. 用户运行 `netscope`
3. CLI 启动本地服务并打开 Web UI
4. CLI 等待用户粘贴调试 URI
5. 用户回车提交 URI
6. CLI 开始附着调试链路

### 8.2 URI 输入行为

- 交互式粘贴是主路径
- `--uri` 参数可作为补充方式
- 连接成功后不再接受新的 URI
- CLI 仍保留普通命令输入

### 8.3 V1 状态展示

CLI 和 Web UI 统一只展示三个状态：

- 服务已启动
- 已附着调试链路
- 已检测到 SDK 事件

### 8.4 CLI 命令

#### 基础命令

- `clear` / `-c`
- `status` / `-s`
- `help` / `-h`
- `exit` / `-e`

#### 配置命令

- `max-messages <n>` / `-mm <n>`
- `body-limit <n>` / `-bl <n>`

### 8.5 CLI 配置规则

- `-mm` 和 `-bl` 保存在本地 CLI 配置
- 不写入项目仓库
- 下次启动生效
- CLI 启动时要显示当前配置值

### 8.6 CLI 输出要求

启动后至少输出：

- 本地服务地址
- Web UI 地址
- 当前 `max-messages`
- 当前 `body-limit`
- 等待粘贴 URI 提示

连接后至少输出：

- 已附着调试链路
- 是否检测到 SDK 事件
- 最近错误摘要

---

## 9. 桌面端 reader 与 assembler 需求

### 9.1 transport reader

负责：

- 连接调试 URI
- 读取原始调试事件
- 只保留 NetScope 标识事件
- 丢弃普通应用日志

### 9.2 event assembler

负责：

- 重组分片
- 处理乱序事件
- 合并 request_started / finished / failed
- 维护当前 session 状态
- 产出给 Web UI 的请求列表模型

### 9.3 乱序处理

允许：

- finished/failed 先于 started 到达

行为：

- 先按 requestId 缓存
- 等待 started 到达后合并

### 9.4 超时清理

对于等待 started 或等待分片完成的临时缓存：

- 必须有超时清理
- 超时后转为诊断错误
- 防止内存泄漏

### 9.5 started 建记录规则

只有完整收到并重组出 `request_started` 后，才允许在 UI 列表创建请求记录。

### 9.6 incomplete 规则

如果 started 已建立，但后续 finished/failed 缺失或重组失败：

- 保留记录
- 标记为 `incomplete`
- Diagnostics 展示原因

---

## 10. Web UI 需求

### 10.1 页面结构

V1 单页结构建议：

```text
┌──────────────────────────────────────────────┐
│ Header                                       │
│ 服务状态 | 调试链路状态 | SDK 状态 | 清空    │
├──────────────────────────────────────────────┤
│ Filter Bar                                   │
│ URL 关键词 | Method | 状态筛选               │
├──────────────────────────────────────────────┤
│ Main                                         │
│ ┌────────────────┬────────────────────────┐ │
│ │ Request List   │ Request Detail         │ │
│ │                │                        │ │
│ │                │ General                │ │
│ │                │ Request Headers        │ │
│ │                │ Request Body           │ │
│ │                │ Response Headers       │ │
│ │                │ Response Body          │ │
│ │                │ Diagnostics            │ │
│ └────────────────┴────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### 10.2 顶部状态区

必须展示：

- 服务已启动
- 已附着调试链路
- 已检测到 SDK 事件

可附带：

- 当前监听地址
- 当前 session 标识

### 10.3 请求列表

列建议至少包含：

- Time
- Method
- URL summary
- Status
- Duration
- State
- Truncated / Binary 标记

行为要求：

- 默认按 started 时间倒序
- 状态更新时行不跳动
- 点击行切换详情

### 10.4 过滤能力

V1 最少支持：

- URL 关键词
- Method

如有精力可加：

- 状态筛选

### 10.5 详情面板

固定区块：

- General
- Request Headers
- Request Body
- Response Headers
- Response Body
- Diagnostics

### 10.6 详情刷新

若当前选中 requestId 后续有更多事件到达：

- 详情原地增量刷新
- 不要求用户重新点击

### 10.7 Diagnostics 内容

至少包括：

- requestId
- 事件分片情况
- body 是否截断
- 是否二进制/大文件
- 重组失败提示
- 缺失后续事件提示

---

## 11. 存储需求

### 11.1 存储目标

V1 存储只服务当前活跃会话：

- 页面刷新恢复
- 当前会话内控内存

### 11.2 非目标

存储不用于：

- 历史调试归档
- 跨 session 浏览
- 长期日志审计

### 11.3 数据上限

默认最大请求数：

- 建议 `1000`

可通过 CLI 本地配置修改。

### 11.4 超限行为

当请求数超过上限：

- 内存中只保留当前窗口
- 更旧数据进入内部缓冲存储
- 页面只需保障当前会话恢复，不必承诺历史回看体验

### 11.5 清空行为

用户触发 `clear` 或页面清空后：

- 当前会话内存数据清空
- 当前会话内部缓冲同步清空
- UI 立即恢复空列表

---

## 12. HTTP API 与 WebSocket 需求

### 12.1 首屏初始化

页面首次打开或刷新时通过 HTTP 获取：

- 当前三段状态
- 当前会话请求列表
- 当前配置值

### 12.2 实时更新

页面建立 WebSocket 后只接收：

- 状态增量
- 新请求 started
- 请求 finished/failed 更新
- 清空事件

### 12.3 建议接口

#### HTTP

- `GET /api/status`
- `GET /api/requests`
- `POST /api/requests/clear`
- `GET /api/config`

#### WebSocket

- `connection_state`
- `request_started`
- `request_updated`
- `requests_cleared`

接口名可以调整，但职责不能变。

---

## 13. 关键行为验证点

### 13.1 CLI 启动验证

- `netscope` 能成功启动
- 自动打开浏览器页面
- CLI 显示当前配置
- CLI 提示用户粘贴 URI

### 13.2 调试链路验证

- 粘贴合法 URI 后 CLI 进入已附着状态
- 粘贴无效 URI 时给出明确失败提示
- 成功连接后不再接受新的 URI

### 13.3 SDK 接入验证

- 未安装 interceptor 时，CLI 长期收不到 SDK 事件
- 安装 interceptor 后，CLI 能进入“已检测到 SDK 事件”
- enabled=false 时不进入该状态

### 13.4 请求采集验证

- 正常成功请求能显示 started -> complete
- 异常请求能显示 started -> failed
- 连续多次请求能稳定显示
- 请求排序稳定不跳动

### 13.5 body 验证

- JSON body 在上限内可展示
- 超限文本 body 显示截断标记
- 图片/文件/二进制只显示占位信息

### 13.6 UI 验证

- 顶部三段状态正常变化
- 点击列表可查看详情
- 选中请求后详情能持续刷新
- `clear` 后页面列表立即清空

### 13.7 CLI 命令验证

- `-c` 生效
- `-s` 能打印当前状态
- `-h` 能显示命令说明
- `-e` 能退出
- `-mm` 修改后下次启动显示新值
- `-bl` 修改后下次启动显示新值

---

## 14. 开发分步计划

以下顺序按依赖关系安排，按此执行可直接推进开发。

### Step 1. 清理旧概念

目标：

- 删除旧 HTTP 上报、旧 WebSocket 设备通道、旧 VM 混合方案对外文档和入口暴露

要做：

- 清理旧命名
- 清理旧 CLI 文案
- 确立当前文档为唯一依据

交付：

- 代码库不再对外暴露旧方案入口

### Step 2. 定义 shared 协议

目标：

- 先定义稳定 schema，再写实现

要做：

- 定义事件类型
- 定义 request 模型
- 定义状态模型
- 定义 WebSocket 消息模型
- 定义配置模型

交付：

- `packages/shared` 中有清晰、稳定的类型定义

### Step 3. 重做 Dart SDK 核心

目标：

- 只保留 Dio interceptor 路线

要做：

- 删除 host/port 公开配置
- 创建新的 interceptor API
- 实现 requestId 生成
- 实现 encoder
- 实现 sender
- 实现 body 策略

交付：

- example 能编译
- SDK 能在 debug 下产出结构化事件

### Step 4. 实现调试链路 reader

目标：

- CLI 能连接 URI 并读取原始调试事件

要做：

- 接收 URI
- 建立连接
- 过滤 NetScope 事件
- 暴露原始事件流

交付：

- CLI 能打印收到的合法 NetScope 事件计数

### Step 5. 实现 assembler

目标：

- 将原始事件流转为请求生命周期状态

要做：

- 处理分片
- 处理乱序
- 处理 started / finished / failed
- 处理 incomplete
- 维护当前三段状态

交付：

- CLI 能在终端看到请求状态摘要

### Step 6. 实现当前会话存储

目标：

- 支撑刷新恢复和内存控制

要做：

- 当前 session 数据存储
- 上限窗口控制
- 清空逻辑
- 配置读取

交付：

- 当前会话页面刷新后仍可恢复

### Step 7. 实现本地 HTTP API + WebSocket

目标：

- 为 Web UI 提供首屏与增量能力

要做：

- `/api/status`
- `/api/requests`
- `/api/config`
- `clear`
- WebSocket 推送

交付：

- 前端能只靠接口跑通

### Step 8. 实现 Web UI 最小版

目标：

- 完成最小可用调试界面

要做：

- 顶部状态区
- 请求列表
- 详情面板
- URL / Method 过滤
- 清空动作

交付：

- Web UI 可完整查看请求

### Step 9. 实现 CLI 命令系统

目标：

- 补齐最小命令交互

要做：

- `clear/-c`
- `status/-s`
- `help/-h`
- `exit/-e`
- `max-messages/-mm`
- `body-limit/-bl`

交付：

- CLI 能完成运行期控制

### Step 10. 补 example 工程

目标：

- 让 GitHub 用户可快速验证

要做：

- 创建最小 Flutter Dio 示例
- 接入 NetScope interceptor
- 提供可触发成功/失败/大内容的测试请求

交付：

- example 可直接演示抓包流程

### Step 11. 编写 README 和安装说明

目标：

- 仓库对外可安装、可验证

要做：

- 写清产品边界
- 写清 flutter run + netscope + 粘贴 URI 的流程
- 写清 SDK 接入代码
- 写清 CLI 命令
- 写清限制说明

交付：

- 新用户可按 README 走通一次验证

### Step 12. 端到端测试

目标：

- 做第一版最终验收

要做：

- 本地 CLI 安装测试
- Flutter 示例接入测试
- 真机联调测试
- 连续请求稳定性测试
- 清空与刷新恢复测试

交付：

- 满足验收标准

---

## 15. 安装与本地运行指引

以下是第一版应支持的本地安装和运行方式。

### 15.1 仓库准备

```bash
pnpm install
pnpm build
```

### 15.2 本地全局安装 CLI

实现阶段可采用仓库内本地全局链接方式，例如：

```bash
pnpm --filter @netscope/server build
pnpm --filter @netscope/server link --global
```

或项目实际选定的等价方式。

目标要求不是固定某个命令，而是：

- 开发者本机能把 `netscope` 变成可执行全局命令

### 15.3 启动顺序

```bash
flutter run
netscope
```

然后：

- 在 CLI 粘贴调试 URI
- 观察 Web UI 状态变化

---

## 16. 测试执行清单

开发完成后，应至少执行以下测试。

### 16.1 CLI 启动

- 能启动
- 能打开页面
- 能显示配置值

### 16.2 URI 连接

- 粘贴有效 URI 能连接
- 粘贴无效 URI 能报错
- 连接成功后拒绝再次绑定 URI

### 16.3 SDK 接入

- 未接入时无事件
- 接入后有事件
- enabled=false 无事件

### 16.4 请求链路

- 成功请求
- 失败请求
- 多次连续请求
- 大文本响应
- 图片/文件响应

### 16.5 UI 行为

- 列表排序稳定
- 详情自动刷新
- 过滤正常
- 清空正常
- 页面刷新恢复当前会话

### 16.6 命令系统

- `-c`
- `-s`
- `-h`
- `-e`
- `-mm`
- `-bl`

---

## 17. 第一版完成标准

满足以下条件即可视为 V1 完成：

- CLI 能作为全局命令运行
- Flutter Dio 示例可一行接入 interceptor
- `flutter run + netscope + 粘贴 URI` 流程可跑通
- Web UI 能稳定展示请求列表与详情
- 当前会话刷新恢复可用
- 清空功能可用
- 关键 CLI 命令可用
- README 能指导新用户完成一次安装和验证

---

## 18. 建议后续文档

在本文件基础上，后续还可以补：

- `README.md`
- `docs/cli-usage.md`
- `docs/protocol.md`
- `docs/example-guide.md`

但这些文档都应从属于本需求文档，不得与本文件冲突。

---

## 19. 文档完成后待办

- 待办：当项目代码整体完成后，通过钉钉机器人发送完成通知。
- 机器人地址：`https://oapi.dingtalk.com/robot/send?access_token=ae7a01ed25859f3e9f995717eacbb5bd67dde43cbcb889c27a5868aad347016a`
