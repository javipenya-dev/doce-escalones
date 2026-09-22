import 'dart:convert';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Configuración de conexión al backend.
/// IMPORTANTE: la URL correcta depende de dónde corre la app:
///   - Chrome / web:                          http://127.0.0.1:8000
///   - Emulador Android:                      http://10.0.2.2:8000
///   - Dispositivo físico en la misma WiFi:   http://192.168.1.XXX:8000
///
/// Se usa 127.0.0.1 en lugar de localhost en web porque Chrome en Windows
/// resuelve 'localhost' primero a IPv6 (::1), y uvicorn solo escucha IPv4
/// cuando se arranca con --host 0.0.0.0. Eso provoca timeouts de ~21s.
class ApiConfig {
  static String get baseUrl =>
      kIsWeb ? 'http://127.0.0.1:8000' : 'http://10.0.2.2:8000';

  static String get wsUrl =>
      kIsWeb ? 'ws://127.0.0.1:8000' : 'ws://10.0.2.2:8000';
}

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});
  @override
  String toString() => message;
}

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  String? _token;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('token');
  }

  Future<void> setToken(String token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', token);
  }

  Future<void> clearToken() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
    await prefs.remove('usuario');
  }

  String? get token => _token;
  bool get isAuthenticated => _token != null;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final cleanQuery = query?.map((k, v) => MapEntry(k, v.toString()));
    return Uri.parse('${ApiConfig.baseUrl}$path').replace(
      queryParameters: cleanQuery,
    );
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    final res = await http.get(_uri(path, query), headers: _headers);
    return _handle(res);
  }

  Future<dynamic> post(String path, {Map<String, dynamic>? body}) async {
    final res = await http.post(
      _uri(path),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handle(res);
  }

  Future<dynamic> put(String path, {Map<String, dynamic>? body}) async {
    final res = await http.put(
      _uri(path),
      headers: _headers,
      body: body != null ? jsonEncode(body) : null,
    );
    return _handle(res);
  }

  Future<dynamic> delete(String path) async {
    final res = await http.delete(_uri(path), headers: _headers);
    return _handle(res);
  }

  dynamic _handle(http.Response res) {
    if (res.statusCode == 401) {
      clearToken();
      throw ApiException('Sesión caducada, vuelve a iniciar sesión', statusCode: 401);
    }
    if (res.statusCode >= 400) {
      String detail = 'Error del servidor';
      try {
        final body = jsonDecode(res.body);
        detail = body['detail']?.toString() ?? detail;
      } catch (_) {}
      throw ApiException(detail, statusCode: res.statusCode);
    }
    if (res.body.isEmpty) return null;
    return jsonDecode(utf8.decode(res.bodyBytes));
  }
}

final api = ApiService();