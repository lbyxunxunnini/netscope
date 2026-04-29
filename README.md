# NetScope V1

[中文](./README.md) | [English](./README.en.md)

NetScope V1 是一个面向 Flutter `Dio` 的网络调试工具，目标是让你在 **真机/模拟器 debug 场景** 下，不配置代理、不安装证书，就能查看请求与响应明细。

核心思路是：
- Flutter 侧通过 `Dio Interceptor` 采集请求生命周期
- 通过 Dart VM Service Logging 流把结构化事件送到本机 CLI
- CLI 组装事件并通过本地 Web UI 实时展示

---

## 1. 功能介绍

### 1.1 核心能力

- 代码层抓包（仅接入 `Dio` 即可）
- 无需 HTTPS 代理证书
- 请求/响应实时展示（列表 + 详情）
- 支持请求成功、失败、超大 body 截断与二进制占位
- 支持当前会话刷新恢复
- 支持会话清空

### 1.2 CLI 能力

- 本地服务启动并展示 Web UI 地址
- 手动粘贴 VM Service URI 连接
- 自动嗅探 VM Service URI（剪贴板 / 文件）
- 命令行控制：`clear` / `status` / `help` / `exit`
- 本地配置持久化：`max-messages` / `body-limit`

### 1.3 Web UI 能力

- 顶部状态：服务状态、调试链路状态、SDK 事件状态
- 请求列表：Time / Method / URL / Status / Duration / State
- 列宽拖拽调整
- 状态码分级着色（2xx/3xx/4xx/5xx）
- 详情 Tab：General / Req Headers / Req Body / Res Headers / Res Body / Diagnostics
- 右键请求行：复制 URL、复制 cURL
- 详情卡片右上角复制按钮

---

## 2. 适用范围与限制

### 2.1 适用场景

- Flutter App 的 Debug 网络排查
- `Dio` 请求链路问题定位
- 请求参数/响应体可视化分析

### 2.2 当前限制（V1）

- 仅支持 macOS 开发机
- 仅支持 `Dio` 自动接入
- 单 CLI 单会话单调试目标
- 不支持运行中切换 URI（需重启 `netscope`）
- 不做跨会话历史归档

---

## 3. 仓库结构

```text
packages/
  dart-sdk/     Flutter SDK（NetScope.createInterceptor）
  server/       CLI + VM reader + assembler + HTTP/WS 服务
  web/          Web UI
  shared/       协议与共享类型定义
docs/
  requirements-spec-v1.md
```

---

## 4. 环境要求

- Node.js 18+
- pnpm 8+
- Flutter 3.x（可用 `flutter run`）
- Dart 3.x

---

## 5. 安装与构建

### 5.1 远端安装（Remote）

可直接从远端仓库拉取：

```bash
git clone git@github.com:lbyxunxunnini/netscope.git
cd netscope
```

或使用 HTTPS：

```bash
git clone https://github.com/lbyxunxunnini/netscope.git
cd netscope
```

### 5.2 本地安装与构建

在仓库根目录执行：

```bash
pnpm install
pnpm build
```

可选：全局安装 `netscope` 命令（推荐用 `packages/server` 目录执行，避免 `--filter link --global` 在部分 pnpm 版本报错）

```bash
cd /path/to/packet-capture/packages/server
pnpm build
pnpm link --global
```

如果安装后 `netscope` 仍提示 `command not found`，补充 `PATH`：

```bash
pnpm bin -g
# 假设输出 /Users/you/Library/pnpm
echo 'export PATH="$PATH:/Users/you/Library/pnpm"' >> ~/.zshrc
source ~/.zshrc
```

验证：

```bash
which netscope
netscope --help
```

---

## 6. Flutter 侧接入

在你的 Flutter 项目 `pubspec.yaml` 中引入（示例为本地路径）：

```yaml
dependencies:
  netscope:
    path: /Users/you/path/to/packet-capture/packages/dart-sdk
```

在 `Dio` 初始化处添加：

```dart
import 'package:dio/dio.dart';
import 'package:netscope/netscope.dart';
import 'package:flutter/foundation.dart';

final dio = Dio();
dio.interceptors.add(NetScope.createInterceptor(enabled: kDebugMode));
```

最简也可写：

```dart
dio.interceptors.add(NetScope.createInterceptor());
```

---

## 7. 启动使用教程

### 7.1 推荐启动顺序

先启动 Flutter：

```bash
flutter run
```

再启动 NetScope：

```bash
cd /path/to/packet-capture
pnpm --filter @netscope/server start
```

CLI 会显示：
- 服务地址
- Web UI 地址
- 当前配置
- 等待 URI 提示

### 7.2 连接 VM Service（两种方式）

#### A. 手动粘贴
把 `flutter run` 输出里的 VM Service URI 粘贴到 CLI 回车，例如：

```text
ws://127.0.0.1:56643/CjOv4Rk8CU4=/ws
```

#### B. 自动嗅探 + 确认连接
CLI 会自动嗅探：
- 剪贴板里的 `ws://127.0.0.1:.../.../ws`
- `${projectRoot}/.dart_tool/netscope_vm_service_uri`

可这样启动增强嗅探：

```bash
netscope --project-root /absolute/path/to/flutter_project
```

当嗅探到 URI 后，CLI 会提示是否连接，输入：

```text
y
```

即可连接。

### 7.3 稳定写出 VM URI（推荐）

让 Flutter 自动把 VM URI 写到文件：

```bash
flutter run --vmservice-out-file=.dart_tool/netscope_vm_service_uri
```

再配合：

```bash
netscope --project-root /absolute/path/to/flutter_project
```

---

## 8. Web UI 使用说明

打开 CLI 输出的地址（默认）：

- [http://127.0.0.1:9527](http://127.0.0.1:9527)

常见操作：
- 顶部看连接状态是否已就绪
- 输入 URL 关键词过滤
- 选择 Method 过滤
- 点击请求行看右侧详情
- 拖拽表头分隔线调整列宽
- 右键请求行复制 URL/cURL
- 在详情卡片右上角复制内容

---

## 9. CLI 命令

- `help` / `-h`：显示帮助
- `status` / `-s`：查看当前状态
- `clear` / `-c`：清空当前会话请求
- `exit` / `-e`：退出 CLI
- `max-messages <n>` / `-mm <n>`：设置最大请求缓存数（下次启动生效）
- `body-limit <n>` / `-bl <n>`：设置 body 截断上限字节数（下次启动生效）

配置文件位置：

```text
~/.netscope/config.json
```

---

## 10. HTTP API / WebSocket

### HTTP

- `GET /api/status`
- `GET /api/requests`
- `POST /api/requests/clear`
- `GET /api/config`

### WebSocket

- `connection_state`
- `request_started`
- `request_updated`
- `requests_cleared`

---

## 11. 验证清单（建议）

1. 启动 `netscope` 后 Web 可打开
2. 粘贴或嗅探 URI 后显示已附着
3. 触发 Dio 请求后出现列表数据
4. 成功请求显示 `completed`
5. 失败请求显示 `failed`
6. 详情可查看 headers/body/diagnostics
7. `clear` 后列表立即清空
8. 刷新页面后当前会话可恢复

---

## 12. 常见问题（FAQ）

### Q1: 已附着但 `已检测到 SDK 事件=false`
排查：
- 是否真的走了接入的 `Dio` 实例
- 是否在 debug 模式
- `enabled` 是否被设置为 `false`
- 是否触发了真实网络请求

### Q2: CLI 里出现 `parse error`
通常是 VM 日志内容不完整或异常。建议：
- 升级到当前仓库最新代码
- 重启 `flutter run` 和 `netscope`
- 使用 `--vmservice-out-file` + `--project-root` 方式稳定连接

### Q3: 为什么看不到历史会话
V1 仅保留当前 CLI 活跃会话数据，重启后不保留历史。

---

## 13. 本地开发

### 13.1 开发模式

```bash
pnpm dev
```

### 13.2 仅构建 server

```bash
pnpm --filter @netscope/server build
pnpm --filter @netscope/server start
```

### 13.3 全量构建

```bash
pnpm build
```

---

## 14. 版本说明

当前为 V1 实现，设计目标与边界以 `docs/requirements-spec-v1.md` 为准。
