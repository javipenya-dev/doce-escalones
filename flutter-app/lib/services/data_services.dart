import '../services/api_service.dart';
import '../services/offline_queue_service.dart';
import '../models/models.dart';

/// GET /alumnos — confirmado en openapi.json
class AlumnosService {
  static Future<List<Alumno>> listar({bool soloActivos = true}) async {
    final data = await api.get('/alumnos', query: {'activo': soloActivos});
    return (data as List).map((e) => Alumno.fromJson(e)).toList();
  }
}

/// GET /tipos-clase — siempre disponible, no depende de packs del alumno.
class TiposClaseService {
  static Future<List<TipoClase>> listar() async {
    final data = await api.get('/tarifas/tipos-clase');
    return (data as List).map((e) => TipoClase.fromJson(e)).toList();
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
  static Future<void> actualizar(int id, {String? horaInicio, int? duracionMin}) async {
    final body = <String, dynamic>{};
    if (horaInicio != null) body['hora_inicio'] = horaInicio;
    if (duracionMin != null) body['duracion_min'] = duracionMin;
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