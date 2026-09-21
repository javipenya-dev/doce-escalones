/// Modelos de datos — reflejan EXACTAMENTE los schemas Pydantic reales
/// confirmados en /openapi.json del backend.

/// Coincide con TipoClaseOut (GET /tipos-clase) — siempre disponible,
/// independiente de si el alumno tiene algún pack asignado.
/// El profesor elige aquí directamente "Apoyo", "Inglés A1", "Logopedia"...
class TipoClase {
  final int id;
  final String nombre;
  final String categoria; // normal | ingles | sesion

  TipoClase({
    required this.id,
    required this.nombre,
    required this.categoria,
  });

  String get icono {
    switch (categoria) {
      case 'ingles':
        return '🇬🇧';
      case 'sesion':
        return '🏥';
      default:
        return '📚';
    }
  }

  bool get esSesion => categoria == 'sesion';

  factory TipoClase.fromJson(Map<String, dynamic> json) => TipoClase(
        id: json['id'],
        nombre: json['nombre'] ?? '',
        categoria: json['categoria'] ?? 'normal',
      );
}

class Alumno {
  final int id;
  final String nombre;
  final String apellidos;
  final String? telefono1;
  final String? email;
  final bool activo;

  Alumno({
    required this.id,
    required this.nombre,
    required this.apellidos,
    this.telefono1,
    this.email,
    required this.activo,
  });

  String get nombreCompleto => '$nombre $apellidos';

  // Coincide con AlumnoListItem en schemas.py
  factory Alumno.fromJson(Map<String, dynamic> json) => Alumno(
        id: json['id'],
        nombre: json['nombre'] ?? '',
        apellidos: json['apellidos'] ?? '',
        telefono1: json['telefono1'],
        email: json['email'],
        activo: json['activo'] ?? true,
      );
}

/// Coincide EXACTAMENTE con PackActivoSimple (GET /alumnos/{id}/packs-activos)
class PackActivo {
  final int id;              // pack_alumno_id — necesario en AsistenciaCreate
  final String categoria;    // normal | ingles | sesion
  final int tipoClaseId;     // necesario en AsistenciaCreate
  final String tipoClaseNombre;

  PackActivo({
    required this.id,
    required this.categoria,
    required this.tipoClaseId,
    required this.tipoClaseNombre,
  });

  String get icono {
    switch (categoria) {
      case 'ingles':
        return '🇬🇧';
      case 'sesion':
        return '🏥';
      default:
        return '📚';
    }
  }

  String get categoriaLabel {
    switch (categoria) {
      case 'ingles':
        return 'Inglés';
      case 'sesion':
        return 'Sesión';
      default:
        return 'Normal';
    }
  }

  bool get esSesion => categoria == 'sesion';

  factory PackActivo.fromJson(Map<String, dynamic> json) => PackActivo(
        id: json['id'],
        categoria: json['categoria'] ?? 'normal',
        tipoClaseId: json['tipo_clase_id'],
        tipoClaseNombre: json['tipo_clase_nombre'] ?? '',
      );
}

/// Coincide EXACTAMENTE con AsistenciaCreate en schemas.py
class AsistenciaRegistro {
  final int alumnoId;
  final int packAlumnoId;
  final int tipoClaseId;
  final DateTime fecha;
  final String? horaInicio;   // formato "HH:mm:ss", opcional según schema
  final int duracionMin;
  final bool esSesion;
  final String? uuidLocal;    // para sync offline

  AsistenciaRegistro({
    required this.alumnoId,
    required this.packAlumnoId,
    required this.tipoClaseId,
    required this.fecha,
    this.horaInicio,
    required this.duracionMin,
    this.esSesion = false,
    this.uuidLocal,
  });

  Map<String, dynamic> toJson() => {
        'alumno_id': alumnoId,
        'pack_alumno_id': packAlumnoId,
        'tipo_clase_id': tipoClaseId,
        'fecha':
            '${fecha.year}-${fecha.month.toString().padLeft(2, '0')}-${fecha.day.toString().padLeft(2, '0')}',
        if (horaInicio != null) 'hora_inicio': horaInicio,
        'duracion_min': duracionMin,
        'es_sesion': esSesion,
        if (uuidLocal != null) 'uuid_local': uuidLocal,
      };
}

/// Coincide con ResumenMensualOut — viene en la respuesta al registrar asistencia
class ResumenMensual {
  final int anio;
  final int mes;
  final double horasConsumidas;
  final int sesionesConsumidas;
  final int semanasEnMes;
  final double? horasContratadas;
  final int? sesionesContratadas;
  final String estado; // verde | rojo | amarillo | naranja
  final int horasExtra;

  ResumenMensual({
    required this.anio,
    required this.mes,
    required this.horasConsumidas,
    required this.sesionesConsumidas,
    required this.semanasEnMes,
    this.horasContratadas,
    this.sesionesContratadas,
    required this.estado,
    required this.horasExtra,
  });

  factory ResumenMensual.fromJson(Map<String, dynamic> json) => ResumenMensual(
        anio: json['anio'],
        mes: json['mes'],
        horasConsumidas: (json['horas_consumidas'] ?? 0).toDouble(),
        sesionesConsumidas: json['sesiones_consumidas'] ?? 0,
        semanasEnMes: json['semanas_en_mes'] ?? 4,
        horasContratadas: json['horas_contratadas']?.toDouble(),
        sesionesContratadas: json['sesiones_contratadas'],
        estado: json['estado'] ?? 'verde',
        horasExtra: json['horas_extra'] ?? 0,
      );
}

/// Coincide con AlumnoDashboard — usado en /dashboard/mes y /dashboard/alertas-semaforo
class AlumnoDashboard {
  final int id;
  final String nombre;
  final String apellidos;
  final String estado; // verde | rojo | amarillo | naranja
  final double horasMes;
  final int sesionesMes;
  final double? horasContratadas;
  final int? sesionesContratadas;
  final double? importeDebido;

  AlumnoDashboard({
    required this.id,
    required this.nombre,
    required this.apellidos,
    required this.estado,
    required this.horasMes,
    required this.sesionesMes,
    this.horasContratadas,
    this.sesionesContratadas,
    this.importeDebido,
  });

  String get nombreCompleto => '$nombre $apellidos';

  factory AlumnoDashboard.fromJson(Map<String, dynamic> json) => AlumnoDashboard(
        id: json['id'],
        nombre: json['nombre'] ?? '',
        apellidos: json['apellidos'] ?? '',
        estado: json['estado'] ?? 'verde',
        horasMes: (json['horas_mes'] ?? 0).toDouble(),
        sesionesMes: json['sesiones_mes'] ?? 0,
        horasContratadas: json['horas_contratadas']?.toDouble(),
        sesionesContratadas: json['sesiones_contratadas'],
        importeDebido: json['importe_debido']?.toDouble(),
      );
}