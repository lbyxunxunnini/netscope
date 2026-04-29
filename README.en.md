# NetScope V1

[中文](./README.md) | [English](./README.en.md)

NetScope V1 is a network debugging tool for Flutter `Dio` in debug sessions. It captures request lifecycle events in code, streams them through Dart VM Service logging, and renders them in a local Web UI.

---

## 1. Features

- Code-level capture for `Dio` requests/responses
- No proxy / no HTTPS certificate setup
- Real-time request list + detail inspector
- Truncation and binary placeholder handling for large/non-text bodies
- Session-scoped data with page-refresh recovery
- CLI controls (`clear`, `status`, `help`, `exit`, config commands)

### CLI

- Start local service + Web UI
- Attach by pasting VM Service URI
- Auto-sniff VM URI (clipboard / file)
- Persist local config (`max-messages`, `body-limit`)

### Web UI

- Status chips (service / VM attached / SDK detected)
- Filter by URL keyword and method
- Resizable columns
- Status code color grading (2xx/3xx/4xx/5xx)
- Tabbed detail panel
- Right-click row: copy URL / copy cURL
- Copy button on each detail card

---

## 2. Scope & Limits

- macOS dev machine only
- Auto integration for `Dio` only
- Single CLI instance = single active session
- No URI switching during runtime (restart `netscope`)
- No cross-session history archive in V1

---

## 3. Repo Layout

```text
packages/
  dart-sdk/     Flutter SDK (NetScope.createInterceptor)
  server/       CLI + VM reader + assembler + HTTP/WS service
  web/          Web UI
  shared/       Shared protocol/types
docs/
  requirements-spec-v1.md
```

---

## 4. Requirements

- Node.js 18+
- pnpm 8+
- Flutter 3.x
- Dart 3.x

---

## 5. Install & Build

### 5.1 Remote Installation

Clone directly from the remote repository:

```bash
git clone git@github.com:lbyxunxunnini/netscope.git
cd netscope
```

Or use HTTPS:

```bash
git clone https://github.com/lbyxunxunnini/netscope.git
cd netscope
```

### 5.2 Local Install & Build

```bash
pnpm install
pnpm build
```

Optional global CLI install (recommended to run inside `packages/server`, since `--filter link --global` may fail on some pnpm versions):

```bash
cd /path/to/netscope/packages/server
pnpm build
pnpm link --global
```

If `netscope` is still not found, add pnpm global bin to `PATH`:

```bash
pnpm bin -g
# assume output is /Users/you/Library/pnpm
echo 'export PATH="$PATH:/Users/you/Library/pnpm"' >> ~/.zshrc
source ~/.zshrc
```

Verify:

```bash
which netscope
netscope --help
```

---

## 6. Flutter Integration

### 6.1 Local Path Dependency (for local development)

In your Flutter `pubspec.yaml`:

```yaml
dependencies:
  netscope:
    path: /Users/you/path/to/netscope/packages/dart-sdk
```

### 6.2 Remote Git Dependency (recommended for teams)

Use the Dart SDK directly from this repository subdirectory:

```yaml
dependencies:
  netscope:
    git:
      url: https://github.com/lbyxunxunnini/netscope.git
      ref: main
      path: packages/dart-sdk
```

Or with SSH:

```yaml
dependencies:
  netscope:
    git:
      url: git@github.com:lbyxunxunnini/netscope.git
      ref: main
      path: packages/dart-sdk
```

For reproducible builds, pin `ref` to a tag (for example, `1.0.0`) instead of `main`.

At `Dio` initialization:

```dart
import 'package:dio/dio.dart';
import 'package:netscope/netscope.dart';
import 'package:flutter/foundation.dart';

final dio = Dio();
dio.interceptors.add(NetScope.createInterceptor(enabled: kDebugMode));
```

Minimal form:

```dart
dio.interceptors.add(NetScope.createInterceptor());
```

---

## 7. Run Guide

### Recommended order

```bash
flutter run
```

Then:

```bash
cd /path/to/netscope
pnpm --filter @netscope/server start
```

### Connect VM Service

#### Manual
Paste VM URI from `flutter run` output into CLI:

```text
ws://127.0.0.1:56643/CjOv4Rk8CU4=/ws
```

#### Auto sniff + confirm
CLI sniffs from:
- Clipboard
- `${projectRoot}/.dart_tool/netscope_vm_service_uri`

Use:

```bash
netscope --project-root /absolute/path/to/flutter_project
```

When URI is detected, input:

```text
y
```

to connect.

### Stable VM URI file (recommended)

```bash
flutter run --vmservice-out-file=.dart_tool/netscope_vm_service_uri
```

Then:

```bash
netscope --project-root /absolute/path/to/flutter_project
```

---

## 8. Web UI

Default URL:

- [http://127.0.0.1:9527](http://127.0.0.1:9527)

Typical workflow:
- Verify status chips are ready
- Filter requests
- Select a row to inspect tabs on the right
- Resize columns by dragging header edges
- Right-click row to copy URL/cURL
- Use card-level copy buttons

---

## 9. CLI Commands

- `help` / `-h`
- `status` / `-s`
- `clear` / `-c`
- `exit` / `-e`
- `max-messages <n>` / `-mm <n>`
- `body-limit <n>` / `-bl <n>`

Config file:

```text
~/.netscope/config.json
```

---

## 10. API & WebSocket

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

## 11. CLI Artifact & Global Install

### 11.1 Build Artifact

After `pnpm build`, the CLI artifact is:

- `packages/server/dist/index.js` (actual `netscope` executable entry)

`packages/server/package.json` maps:

- `bin.netscope -> ./dist/index.js`

### 11.2 Global Install from Local Source

```bash
cd /path/to/netscope/packages/server
pnpm build
pnpm link --global
```

### 11.3 Remote Global Install (without cloning first)

Install directly from GitHub:

```bash
pnpm add -g "github:lbyxunxunnini/netscope#main&path:packages/server"
```

Pin to a tag when needed:

```bash
pnpm add -g "github:lbyxunxunnini/netscope#1.0.0&path:packages/server"
```

### 11.4 Verify

```bash
which netscope
netscope --help
```

---

## 12. Validation Checklist

1. `netscope` starts and Web opens
2. VM URI attaches successfully
3. Requests appear after app traffic
4. Success path shows `completed`
5. Error path shows `failed`
6. Detail tabs show headers/body/diagnostics
7. `clear` empties list immediately
8. Page refresh restores current session

---

## 13. FAQ

### SDK detected stays `false`
Check:
- App is using the same `Dio` instance with interceptor
- Running in debug
- `enabled` is not `false`
- Real requests are triggered

### Parse errors in CLI
Usually from incomplete VM log content. Try:
- Update to latest code
- Restart both `flutter run` and `netscope`
- Prefer `--vmservice-out-file` + `--project-root`

### No historical sessions
V1 keeps only current active session data.

---

## 14. Local Development

```bash
pnpm dev
```

Server only:

```bash
pnpm --filter @netscope/server build
pnpm --filter @netscope/server start
```

Full build:

```bash
pnpm build
```

---

## 15. Version Note

This is V1. Scope and behavior are aligned with `docs/requirements-spec-v1.md`.
