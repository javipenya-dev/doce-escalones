import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Configuración de conexión al backend.
/// IMPORTANTE: cambiar API_BASE_URL según dónde corra uvicorn:
///   - Emulador Android conectando a tu PC:    http://10.0.2.2:8000
///   - Dispositivo físico en la misma WiFi:    http://192.168.1.XXX:8000 (IP del PC con uvicorn)
class ApiConfig {
  // 10.0.2.2 es el alias especial del emulador Android para llegar
  // al localhost de tu portátil, donde corre uvicorn (puerto 8000).
  // Si más adelante pruebas en un MÓVIL FÍSICO, cambia esto por la IP
  // real de tu portátil en la red WiFi (ej: 192.168.1.XXX).
  static String baseUrl = 'http://10.0.2.2:8000';
  static String wsUrl = 'ws://10.0.2.2:8000';
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