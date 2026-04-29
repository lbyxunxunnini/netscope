# NetScope Flutter Example (V1)

用于验证 NetScope V1 的最小示例要求：

1. 使用 Dio
2. 安装 `NetScope.createInterceptor()`
3. 提供三个测试按钮：成功请求、失败请求、大 Body 请求

## 示例接入片段

```dart
final dio = Dio();
dio.interceptors.add(NetScope.createInterceptor());
```

## 验证步骤

1. `flutter run`
2. `netscope`
3. 粘贴调试 URI
4. 点击示例请求按钮
5. 在 Web UI 验证请求状态与详情更新
