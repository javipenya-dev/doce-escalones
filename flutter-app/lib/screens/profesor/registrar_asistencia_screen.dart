import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../theme/app_theme.dart';
import '../../models/models.dart';
import '../../services/data_services.dart';
import '../../services/api_service.dart';

class RegistrarAsistenciaScreen extends StatefulWidget {
  const RegistrarAsistenciaScreen({super.key});

  @override
  State<RegistrarAsistenciaScreen> createState() => _RegistrarAsistenciaScreenState();
}

class _RegistrarAsistenciaScreenState extends State<RegistrarAsistenciaScreen> {
  List<Alumno> _alumnos = [];
  List<TipoClase> _tiposClase = [];

  Alumno? _alumnoSeleccionado;
  TipoClase? _tipoClaseSeleccionado;

  DateTime _fecha = DateTime.now();
  TimeOfDay _horaInicio = TimeOfDay.now();
  TimeOfDay _horaFin = TimeOfDay.now();

  bool _loadingAlumnos = true;
  bool _loadingTipos = true;
  bool _guardando = false;
  String _busqueda = '';

  // Ninguna clase real dura más de 4 horas. Protege contra el caso de
  // seleccionar por error hora_fin < hora_inicio (ej. 10:00 → 09:00),
  // que sin este límite se interpreta como "cruza medianoche" y genera
  // una asistencia de ~23h, contaminando horas_consumidas del resumen
  // mensual del alumno.
  static const int _duracionMaximaMin = 240;

  // Ventana permitida para registrar asistencias con fecha pasada:
  // hasta 30 días atrás (olvidos razonables), nunca en el futuro.
  static const int _diasAtrasPermitidos = 30;

  @override
  void initState() {
    super.initState();
    _cargarAlumnos();
    _cargarTiposClase();
    _horaFin = TimeOfDay(
      hour: (_horaInicio.hour + 1) % 24,
      minute: _horaInicio.minute,
    );
  }

  Future<void> _cargarAlumnos() async {
    try {
      final alumnos = await AlumnosService.listar();
      setState(() {
        _alumnos = alumnos;
        _loadingAlumnos = false;
      });
    } catch (e) {
      setState(() => _loadingAlumnos = false);
      _mostrarError('No se pudieron cargar los alumnos: $e');
    }
  }

  /// Tipos de clase (Apoyo, Inglés A1, Logopedia...) — siempre disponibles,
  /// no dependen de si el alumno tiene algún pack pagado o pendiente.
  /// El profesor elige directamente qué clase está dando.
  Future<void> _cargarTiposClase() async {
    try {
      final tipos = await TiposClaseService.listar();
      setState(() {
        _tiposClase = tipos;
        _loadingTipos = false;
      });
    } catch (e) {
      setState(() => _loadingTipos = false);
      _mostrarError('No se pudieron cargar los tipos de clase: $e');
    }
  }

  int get _duracionMinutos {
    final inicioMin = _horaInicio.hour * 60 + _horaInicio.minute;
    var finMin = _horaFin.hour * 60 + _horaFin.minute;
    if (finMin < inicioMin) finMin += 24 * 60;
    return finMin - inicioMin;
  }

  bool get _duracionValida =>
      _duracionMinutos > 0 && _duracionMinutos <= _duracionMaximaMin;

  Future<void> _pickFecha() async {
    final hoy = DateTime.now();
    final hoySinHora = DateTime(hoy.year, hoy.month, hoy.day);
    final resultado = await showDatePicker(
      context: context,
      initialDate: _fecha,
      firstDate: hoySinHora.subtract(const Duration(days: _diasAtrasPermitidos)),
      lastDate: hoySinHora,
      helpText: 'Fecha de la clase',
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(primary: AppColors.orange),
        ),
        child: child!,
      ),
    );
    if (resultado != null) {
      setState(() => _fecha = resultado);
    }
  }

  Future<void> _pickHora(bool esInicio) async {
    final inicial = esInicio ? _horaInicio : _horaFin;
    final resultado = await showTimePicker(
      context: context,
      initialTime: inicial,
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: Theme.of(context).colorScheme.copyWith(primary: AppColors.orange),
        ),
        child: child!,
      ),
    );
    if (resultado != null) {
      setState(() {
        if (esInicio) {
          _horaInicio = resultado;
        } else {
          _horaFin = resultado;
        }
      });
    }
  }

  bool get _formularioValido =>
      _alumnoSeleccionado != null &&
      _tipoClaseSeleccionado != null &&
      _duracionValida;

  /// Muestra "Hoy" / "Ayer" para los casos más frecuentes, y dd/mm/aaaa
  /// para cualquier otra fecha dentro de la ventana permitida.
  String _formatearFecha(DateTime f) {
    final hoy = DateTime.now();
    final ayer = hoy.subtract(const Duration(days: 1));
    bool esMismoDia(DateTime a, DateTime b) =>
        a.year == b.year && a.month == b.month && a.day == b.day;

    if (esMismoDia(f, hoy)) return 'Hoy';
    if (esMismoDia(f, ayer)) return 'Ayer';
    return '${f.day.toString().padLeft(2, '0')}/${f.month.toString().padLeft(2, '0')}/${f.year}';
  }

  Future<void> _guardar() async {
    if (!_formularioValido) return;

    setState(() => _guardando = true);
    try {
      // NOTA: pack_alumno_id se manda como 0 (no resuelto desde el móvil).
      // El backend, si no encuentra un pack activo válido con ese id para
      // este alumno, busca o crea automáticamente un "pack pendiente" para
      // la categoría del tipo de clase elegido. El profesor nunca necesita
      // saber si el alumno tiene packs, tarifas, ni si ha pagado.
      final reg = AsistenciaRegistro(
        alumnoId: _alumnoSeleccionado!.id,
        packAlumnoId: 0,
        tipoClaseId: _tipoClaseSeleccionado!.id,
        fecha: _fecha,
        horaInicio:
            '${_horaInicio.hour.toString().padLeft(2, '0')}:${_horaInicio.minute.toString().padLeft(2, '0')}:00',
        duracionMin: _duracionMinutos,
        esSesion: _tipoClaseSeleccionado!.esSesion,
        uuidLocal: const Uuid().v4(),
      );

      await AsistenciasService.registrar(reg);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('✅ Asistencia registrada — ${_alumnoSeleccionado!.nombreCompleto}'),
            backgroundColor: AppColors.verde,
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      _mostrarError(e is ApiException ? e.message : 'Error al guardar');
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  void _mostrarError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: AppColors.rojo),
    );
  }

  /// Quita acentos para que la búsqueda funcione igual con o sin tildes/ñ
  /// (ej: "perez" encuentra "Pérez", "nino" encuentra "Niño").
  String _normalizar(String texto) {
    const conAcento =  'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ';
    const sinAcento =  'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN';
    var resultado = texto;
    for (var i = 0; i < conAcento.length; i++) {
      resultado = resultado.replaceAll(conAcento[i], sinAcento[i]);
    }
    return resultado.toLowerCase();
  }

  @override
  Widget build(BuildContext context) {
    final busquedaNormalizada = _normalizar(_busqueda);
    final alumnosFiltrados = _alumnos
        .where((a) => _normalizar(a.nombreCompleto).contains(busquedaNormalizada))
        .toList();

    final loadingInicial = _loadingAlumnos || _loadingTipos;

    return Scaffold(
      appBar: AppBar(title: const Text('Registrar asistencia')),
      body: loadingInicial
          ? const Center(child: CircularProgressIndicator(color: AppColors.orange))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── PASO 1: Alumno ──────────────────────────────
                  const _StepLabel(numero: 1, texto: 'Selecciona el alumno'),
                  const SizedBox(height: 8),

                  if (_alumnoSeleccionado == null) ...[
                    TextField(
                      decoration: const InputDecoration(
                        hintText: 'Buscar alumno...',
                        prefixIcon: Icon(Icons.search),
                      ),
                      onChanged: (v) => setState(() => _busqueda = v),
                    ),
                    const SizedBox(height: 12),
                    if (alumnosFiltrados.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 20),
                        child: Text('No se encontraron alumnos',
                            style: TextStyle(color: AppColors.greyMid)),
                      ),
                    ...alumnosFiltrados.map((a) => Card(
                          margin: const EdgeInsets.only(bottom: 6),
                          child: ListTile(
                            title: Text(a.nombreCompleto),
                            onTap: () => setState(() => _alumnoSeleccionado = a),
                          ),
                        )),
                  ] else ...[
                    Card(
                      color: AppColors.orangePale,
                      child: ListTile(
                        title: Text(
                          _alumnoSeleccionado!.nombreCompleto,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => setState(() {
                            _alumnoSeleccionado = null;
                          }),
                        ),
                      ),
                    ),
                  ],

                  // ── PASO 2: Tipo de clase ────────────────────────
                  // Siempre disponible — el profesor elige directamente
                  // qué clase está dando, sin saber nada de tarifas/packs.
                  if (_alumnoSeleccionado != null) ...[
                    const SizedBox(height: 20),
                    const _StepLabel(numero: 2, texto: 'Tipo de clase'),
                    const SizedBox(height: 8),

                    if (_tiposClase.isEmpty)
                      const Text(
                        '⚠️ No hay tipos de clase configurados. Avisa al admin.',
                        style: TextStyle(color: AppColors.rojo),
                      )
                    else
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: _tiposClase.map((t) {
                          final selected = _tipoClaseSeleccionado?.id == t.id;
                          return ChoiceChip(
                            label: Text('${t.icono} ${t.nombre}'),
                            selected: selected,
                            selectedColor: AppColors.orange,
                            labelStyle: TextStyle(
                              color: selected ? Colors.white : AppColors.black,
                              fontWeight: FontWeight.w600,
                            ),
                            onSelected: (_) => setState(() => _tipoClaseSeleccionado = t),
                          );
                        }).toList(),
                      ),
                  ],

                  // ── PASO 3: Fecha y horario ───────────────────────
                  if (_alumnoSeleccionado != null && _tipoClaseSeleccionado != null) ...[
                    const SizedBox(height: 20),
                    const _StepLabel(numero: 3, texto: 'Fecha y horario'),
                    const SizedBox(height: 8),

                    InkWell(
                      onTap: _pickFecha,
                      borderRadius: BorderRadius.circular(10),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                        decoration: BoxDecoration(
                          color: AppColors.white,
                          border: Border.all(color: AppColors.greyBorder),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.calendar_today, size: 18, color: AppColors.orange),
                            const SizedBox(width: 10),
                            Text(
                              _formatearFecha(_fecha),
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                            ),
                            const Spacer(),
                            const Icon(Icons.edit, size: 16, color: AppColors.greyMid),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),

                    Row(
                      children: [
                        Expanded(
                          child: _HoraButton(
                            label: 'Inicio',
                            hora: _horaInicio,
                            onTap: () => _pickHora(true),
                          ),
                        ),
                        const SizedBox(width: 12),
                        const Icon(Icons.arrow_forward, color: AppColors.greyMid),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _HoraButton(
                            label: 'Fin',
                            hora: _horaFin,
                            onTap: () => _pickHora(false),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _duracionMinutos <= 0
                          ? '⚠️ La hora de fin debe ser posterior a la de inicio'
                          : _duracionMinutos > _duracionMaximaMin
                              ? '⚠️ Duración de ${(_duracionMinutos / 60).toStringAsFixed(1)}h — revisa las horas, parece demasiado larga'
                              : 'Duración: ${(_duracionMinutos / 60).toStringAsFixed(1)}h ($_duracionMinutos min)',
                      style: TextStyle(
                        color: _duracionValida ? AppColors.greyMid : AppColors.rojo,
                        fontSize: 13,
                      ),
                    ),
                  ],

                  const SizedBox(height: 32),

                  if (_alumnoSeleccionado != null)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _formularioValido && !_guardando ? _guardar : null,
                        style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                        child: _guardando
                            ? const SizedBox(
                                width: 20, height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                              )
                            : const Text('GUARDAR ASISTENCIA'),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _StepLabel extends StatelessWidget {
  final int numero;
  final String texto;
  const _StepLabel({required this.numero, required this.texto});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 22, height: 22,
          decoration: const BoxDecoration(color: AppColors.orange, shape: BoxShape.circle),
          child: Center(
            child: Text('$numero', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
          ),
        ),
        const SizedBox(width: 8),
        Text(texto, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      ],
    );
  }
}

class _HoraButton extends StatelessWidget {
  final String label;
  final TimeOfDay hora;
  final VoidCallback onTap;
  const _HoraButton({required this.label, required this.hora, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.white,
          border: Border.all(color: AppColors.greyBorder),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Text(label, style: const TextStyle(fontSize: 11, color: AppColors.greyMid, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(
              '${hora.hour.toString().padLeft(2, '0')}:${hora.minute.toString().padLeft(2, '0')}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, fontFamily: 'monospace'),
            ),
          ],
        ),
      ),
    );
  }
}