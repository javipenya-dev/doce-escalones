import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_service.dart';
import '../services/offline_queue_service.dart';
import '../models/models.dart';

/// GET /alumnos — con caché local.
///
/// Cuando hay conexión:
///   - Llama al backend, guarda el JSON crudo en SharedPreferences.
/// Cuando NO hay conexión:
///   - Devuelve la última lista cacheada (si existe).
///
/// Así, si abres la app sin WiFi pero ya la has abierto antes con WiFi,
/// tienes los alumnos disponibles para registrar asistencias offline.
class AlumnosService {
  static const _cacheKey = 'cache_alumnos_lista_v1';

  static Future<List<Alumno>> listar({bool soloActivos = true}) async {
    try {
      final data = await api.get('/alumnos', query: {'activo': soloActivos});
      // Guardar copia local (JSON crudo, sin parsear)
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(data));
      return (data as List).map((e) => Alumno.fromJson(e)).toList();
    } catch (e) {
      // Fallback: cargar de la caché local
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw != null && raw.isNotEmpty) {
        try {
          final data = jsonDecode(raw) as List;
          return data.map((e) => Alumno.fromJson(e as Map<String, dynamic>)).toList();
        } catch (_) {
          rethrow; // caché corrupta → propaga el error original
        }
      }
      rethrow; // no hay caché → propaga el error original
    }
  }

  /// Útil para depurar: borra la caché (por ejemplo, tras un cambio grande).
  static Future<void> borrarCache() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cacheKey);
  }
}

/// GET /tipos-clase — con caché local.
///
/// Mismo patrón: la primera vez que hay red, se cachea.
/// Si luego no hay red, se usan los tipos cacheados para poder registrar.
class TiposClaseService {
  static const _cacheKey = 'cache_tipos_clase_v1';

  static Future<List<TipoClase>> listar() async {
    try {
      final data = await api.get('/tarifas/tipos-clase');
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(data));
      return (data as List).map((e) => TipoClase.fromJson(e)).toList();
    } catch (e) {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw != null && raw.isNotEmpty) {
        try {
          final data = jsonDecode(raw) as List;
          return data.map((e) => TipoClase.fromJson(e as Map<String, dynamic>)).toList();
        } catch (_) {
          rethrow;
        }
      }
      rethrow;
    }
  }

  static Future<void> borrarCache() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cacheKey);
  }
}

/// GET /alumnos/{id}/packs-activos
class PacksService {
  static Future<List<PackActivo>> activosDeAlumno(int alumnoId) async {
    final data = await api.get('/alumnos/$alumnoId/packs-activos');
    return (data as List).map((e) => PackActivo.fromJson(e)).toList();
  }
}

/// POST /asistencias, GET /asistencias, GET /asistencias/hoy, DELETE /asistencias/{id}, PUT /asistencias/{id}
class AsistenciasService {
  /// Registra una asistencia. Si no hay conexión al backend, la guarda
  /// en la cola offline del móvil y devuelve `{'offline': true}`.
  static Future<Map<String, dynamic>> registrar(AsistenciaRegistro reg) async {
    final body = reg.toJson();
    try {
      final data = await api.post('/asistencias', body: body);
      return data as Map<String, dynamic>;
    } on ApiException catch (e) {
      if (e.statusCode == null) {
        await OfflineQueueService.encolar(body);
        return {'offline': true};
      }
      rethrow;
    } catch (_) {
      await OfflineQueueService.encolar(body);
      return {'offline': true};
    }
  }

  /// Envía todas las asistencias pendientes al backend.
  static Future<Map<String, dynamic>> sincronizarPendientes() async {
    final pendientes = await OfflineQueueService.pendientes();
    if (pendientes.isEmpty) {
      return {'procesadas': 0, 'duplicadas': 0, 'errores': <String>[]};
    }
    final data = await api.post('/asistencias/sync', body: {
      'asistencias': pendientes,
    });
    final result = data as Map<String, dynamic>;
    await OfflineQueueService.limpiar();
    return result;
  }

  /// Cuántas asistencias hay pendientes de enviar.
  static Future<int> pendientesOffline() async {
    return OfflineQueueService.cantidad();
  }

  /// Asistencias de HOY del profesor logueado.
  static Future<List<dynamic>> hoy() async {
    final data = await api.get('/asistencias/hoy');
    return data as List<dynamic>;
  }

  /// Listado con filtros — SOLO accesible para admins.
  static Future<List<dynamic>> listar({
    String? fechaDesde,
    String? fechaHasta,
    int? profesorId,
    int? alumnoId,
    String? categoria,
  }) async {
    final query = <String, dynamic>{};
    if (fechaDesde != null) query['fecha_desde'] = fechaDesde;
    if (fechaHasta != null) query['fecha_hasta'] = fechaHasta;
    if (profesorId != null) query['profesor_id'] = profesorId;
    if (alumnoId != null) query['alumno_id'] = alumnoId;
    if (categoria != null) query['categoria'] = categoria;

    final data = await api.get('/asistencias', query: query);
    return data as List<dynamic>;
  }

  static Future<void> eliminar(int id) async {
    await api.delete('/asistencias/$id');
  }

    /// Actualiza una asistencia existente — PUT /asistencias/{id}
  static Future<void> actualizar(
    int id, {
    String? horaInicio,
    int? duracionMin,
    String? fecha,
  }) async {
    final body = <String, dynamic>{};
    if (horaInicio != null) body['hora_inicio'] = horaInicio;
    if (duracionMin != null) body['duracion_min'] = duracionMin;
    if (fecha != null) body['fecha'] = fecha;
    await api.put('/asistencias/$id', body: body);
  }
}

/// GET /dashboard/* — requieren rol admin
class DashboardService {
  static Future<Map<String, dynamic>> stats() async {
    final data = await api.get('/dashboard/stats');
    return data as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> ahora() async {
    final data = await api.get('/dashboard/ahora');
    return data as Map<String, dynamic>;
  }

  static Future<List<AlumnoDashboard>> mes({int? anio, int? mes}) async {
    final query = <String, dynamic>{};
    if (anio != null) query['anio'] = anio;
    if (mes != null) query['mes'] = mes;
    final data = await api.get('/dashboard/mes', query: query);
    return (data as List).map((e) => AlumnoDashboard.fromJson(e)).toList();
  }

  static Future<List<AlumnoDashboard>> alertasSemaforo() async {
    final data = await api.get('/dashboard/alertas-semaforo');
    return (data as List).map((e) => AlumnoDashboard.fromJson(e)).toList();
  }
}

/// GET/POST /cobros
class CobrosService {
  static Future<List<dynamic>> listar({int? alumnoId}) async {
    final query = <String, dynamic>{};
    if (alumnoId != null) query['alumno_id'] = alumnoId;
    final data = await api.get('/cobros', query: query);
    return data as List<dynamic>;
  }

  static Future<Map<String, dynamic>> obtener(int cobroId) async {
    final data = await api.get('/cobros/$cobroId');
    return data as Map<String, dynamic>;
  }

  static Future<void> anular(int cobroId) async {
    await api.post('/cobros/$cobroId/anular');
  }
}