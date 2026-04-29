import 'dart:convert';
import 'dart:developer' as developer;
import 'package:dio/dio.dart';

const _protocolVersion = '1.0';
const _sdkVersion = '1.0.0';

class NetScope {
  static Interceptor createInterceptor({bool? enabled}) {
    bool isDebug = false;
    assert(() {
      isDebug = true;
      return true;
    }());
    final active = enabled ?? isDebug;
    return _NetScopeInterceptor(enabled: active);
  }
}

class _NetScopeInterceptor extends Interceptor {
  _NetScopeInterceptor({required this.enabled});

  final bool enabled;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (!enabled) return handler.next(options);

    final requestId = '${DateTime.now().microsecondsSinceEpoch}_${options.hashCode}';
    final startedAt = DateTime.now().millisecondsSinceEpoch;
    options.extra['_netscope_id'] = requestId;
    options.extra['_netscope_started_at'] = startedAt;

    final encoded = _encodeBody(options.data, options.contentType ?? options.headers['content-type']?.toString(), 65536);
    _emit(
      eventType: 'request_started',
      requestId: requestId,
      payload: {
        'method': options.method,
        'url': options.uri.toString(),
        'requestHeaders': options.headers.map((k, v) => MapEntry(k, '$v')),
        'requestBody': encoded.text,
        'requestBodySize': encoded.size,
        'requestBodyTruncated': encoded.truncated,
        'requestBodyBinary': encoded.binary,
      },
    );

    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (!enabled) return handler.next(response);
    final requestId = response.requestOptions.extra['_netscope_id']?.toString() ?? '';
    final startedAt = response.requestOptions.extra['_netscope_started_at'] as int? ?? DateTime.now().millisecondsSinceEpoch;
    final encoded = _encodeBody(response.data, response.headers.value('content-type'), 65536);

    _emit(
      eventType: 'request_finished',
      requestId: requestId,
      payload: {
        'statusCode': response.statusCode ?? 0,
        'responseHeaders': _flattenHeaders(response.headers),
        'responseBody': encoded.text,
        'responseBodySize': encoded.size,
        'responseBodyTruncated': encoded.truncated,
        'responseBodyBinary': encoded.binary,
        'durationMs': DateTime.now().millisecondsSinceEpoch - startedAt,
      },
    );
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (!enabled) return handler.next(err);
    final requestId = err.requestOptions.extra['_netscope_id']?.toString() ?? '';
    final startedAt = err.requestOptions.extra['_netscope_started_at'] as int? ?? DateTime.now().millisecondsSinceEpoch;
    final encoded = _encodeBody(err.response?.data, err.response?.headers.value('content-type'), 65536);

    _emit(
      eventType: 'request_failed',
      requestId: requestId,
      payload: {
        'errorMessage': err.message ?? 'unknown dio error',
        'statusCode': err.response?.statusCode,
        'responseHeaders': err.response == null ? {} : _flattenHeaders(err.response!.headers),
        'responseBody': encoded.text,
        'responseBodySize': encoded.size,
        'responseBodyTruncated': encoded.truncated,
        'responseBodyBinary': encoded.binary,
        'durationMs': DateTime.now().millisecondsSinceEpoch - startedAt,
      },
    );

    handler.next(err);
  }
}

Map<String, String> _flattenHeaders(Headers headers) {
  return headers.map.map((k, v) => MapEntry(k, v.join(', ')));
}

class _BodyEncoded {
  _BodyEncoded({required this.text, required this.size, required this.truncated, required this.binary});
  final String? text;
  final int size;
  final bool truncated;
  final bool binary;
}

_BodyEncoded _encodeBody(dynamic body, String? contentType, int limit) {
  if (body == null) return _BodyEncoded(text: null, size: 0, truncated: false, binary: false);

  final ct = (contentType ?? '').toLowerCase();
  final isText = ct.contains('application/json') || ct.startsWith('text/') || ct.contains('application/x-www-form-urlencoded');

  if (!isText) {
    if (body is List<int>) return _BodyEncoded(text: '[binary body omitted]', size: body.length, truncated: false, binary: true);
    final s = body.toString();
    return _BodyEncoded(text: '[binary or file body omitted]', size: s.length, truncated: false, binary: true);
  }

  String text;
  if (body is String) {
    text = body;
  } else {
    try {
      text = jsonEncode(body);
    } catch (_) {
      text = body.toString();
    }
  }

  final bytes = utf8.encode(text);
  if (bytes.length <= limit) return _BodyEncoded(text: text, size: bytes.length, truncated: false, binary: false);

  final truncated = utf8.decode(bytes.sublist(0, limit), allowMalformed: true);
  return _BodyEncoded(text: truncated, size: bytes.length, truncated: true, binary: false);
}

void _emit({required String eventType, String? requestId, required Map<String, dynamic> payload}) {
  final msg = {
    'protocolVersion': _protocolVersion,
    'sdkVersion': _sdkVersion,
    'eventType': eventType,
    'requestId': requestId,
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'payload': payload,
  };
  developer.log(jsonEncode(msg), name: 'NetScope', level: 800);
}
