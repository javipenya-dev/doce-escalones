import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Cola local de asistencias pendientes de enviar al backend.
///
/// Cuando el profesor registra una asistencia sin conexión, se guarda aquí.
/// Al recuperar la conexión, `AsistenciasService.sincronizarPendientes()`
/// envía todas las pendientes al backend usando POST /asistencias/sync.
/// El backend deduplica por `uuid_local`, así que es seguro reenviar.
class OfflineQueueService {
  static const _key = 'offline_asistencias_pendientes';

  /// Devuelve la lista de asistencias pendientes (JSON crudo).
  static Future<List<Map<String, dynamic>>> pendientes() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  /// Encola una asistencia (body JSON ya formateado).
  static Future<void> encolar(Map<String, dynamic> body) async {
    final actuales = await pendientes();
    actuales.add(body);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(actuales));
  }

  /// Borra toda la cola (tras sincronizar con éxito).
  static Future<void> limpiar() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }

  /// Cuántas asistencias hay pendientes de enviar.
  static Future<int> cantidad() async {
    return (await pendientes()).length;
  }
}