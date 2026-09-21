import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../services/api_service.dart';

class Usuario {
  final int id;
  final String nombre;
  final String apellidos;
  final String? email;
  final String rol; // 'admin' o 'profesor'
  final bool activo;

  Usuario({
    required this.id,
    required this.nombre,
    required this.apellidos,
    this.email,
    required this.rol,
    required this.activo,
  });

  bool get esAdmin => rol == 'admin';

  factory Usuario.fromJson(Map<String, dynamic> json) => Usuario(
        id: json['id'],
        nombre: json['nombre'] ?? '',
        apellidos: json['apellidos'] ?? '',
        email: json['email'],
        rol: json['rol'] ?? 'profesor',
        activo: json['activo'] ?? true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'nombre': nombre,
        'apellidos': apellidos,
        'email': email,
        'rol': rol,
        'activo': activo,
      };
}

class AuthProvider extends ChangeNotifier {
  Usuario? _usuario;
  bool _loading = true;

  Usuario? get usuario => _usuario;
  bool get loading => _loading;
  bool get isAuthenticated => _usuario != null && api.isAuthenticated;

  Future<void> init() async {
    await api.init();
    final prefs = await SharedPreferences.getInstance();
    final usuarioJson = prefs.getString('usuario');
    if (usuarioJson != null && api.token != null) {
      try {
        _usuario = Usuario.fromJson(jsonDecode(usuarioJson));
      } catch (_) {
        _usuario = null;
      }
    }
    _loading = false;
    notifyListeners();
  }

  Future<void> login(String pin, {String? email}) async {
    final data = await api.post('/auth/login', body: {
      'pin': pin,
      if (email != null && email.isNotEmpty) 'email': email,
    });

    final token = data['access_token'] as String;
    final usuarioData = data['usuario'] as Map<String, dynamic>;

    await api.setToken(token);
    _usuario = Usuario.fromJson(usuarioData);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('usuario', jsonEncode(_usuario!.toJson()));

    notifyListeners();
  }

  Future<void> logout() async {
    await api.clearToken();
    _usuario = null;
    notifyListeners();
  }
}