import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../models/models.dart';
import '../../services/data_services.dart';
import 'registrar_asistencia_screen.dart';

class ProfesorHomeScreen extends StatefulWidget {
  const ProfesorHomeScreen({super.key});

  @override
  State<ProfesorHomeScreen> createState() => _ProfesorHomeScreenState();
}

class _ProfesorHomeScreenState extends State<ProfesorHomeScreen> {
  List<dynamic> _misAsistenciasHoy = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    // Intentar enviar asistencias pendientes de la cola offline
    try {
      final pendientes = await AsistenciasService.pendientesOffline();
      if (pendientes > 0) {
        final res = await AsistenciasService.sincronizarPendientes();
        final procesadas = res['procesadas'] ?? 0;
        if (procesadas > 0 && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('🔄 $procesadas asistencias offline sincronizadas'),
              backgroundColor: AppColors.verde,
            ),
          );
        }
      }
    } catch (_) {
      // Silencioso: si falla el sync, seguimos mostrando la lista normal
    }

    setState(() => _loading = true);
    try {
      final data = await AsistenciasService.hoy();
      setState(() => _misAsistenciasHoy = data);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error cargando datos: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final usuario = auth.usuario!;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.orange,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(
                child: Text('12', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ),
            const SizedBox(width: 10),
            const Text('12 Escalones', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: () => auth.logout(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _cargar,
        color: AppColors.orange,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Hola, ${usuario.nombre} 👋',
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                _fechaBonita(),
                style: const TextStyle(color: AppColors.greyMid, fontSize: 14),
              ),
              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () async {
                    final registrado = await Navigator.push<bool>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const RegistrarAsistenciaScreen(),
                      ),
                    );
                    if (registrado == true) _cargar();
                  },
                  icon: const Icon(Icons.add_circle_outline, size: 22),
                  label: const Text('REGISTRAR ASISTENCIA', style: TextStyle(fontSize: 15)),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 18),
                  ),
                ),
              ),

              const SizedBox(height: 28),

              Text(
                'Hoy has registrado',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.greyMid,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 10),

              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(child: CircularProgressIndicator(color: AppColors.orange)),
                )
              else if (_misAsistenciasHoy.isEmpty)
                _EmptyToday()
              else
                ..._misAsistenciasHoy.map((a) => _AsistenciaCard(data: a, onCambio: _cargar)),
            ],
          ),
        ),
      ),
    );
  }

  String _fechaBonita() {
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    final hoy = DateTime.now();
    return '${dias[hoy.weekday - 1]}, ${hoy.day} de ${meses[hoy.month - 1]}';
  }
}

class _EmptyToday extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 40),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyBorder),
      ),
      child: const Column(
        children: [
          Text('📋', style: TextStyle(fontSize: 36)),
          SizedBox(height: 10),
          Text('Aún no has registrado clases hoy',
              style: TextStyle(color: AppColors.greyMid, fontSize: 14)),
        ],
      ),
    );
  }
}

class _AsistenciaCard extends StatefulWidget {
  final dynamic data;
  final VoidCallback onCambio;
  const _AsistenciaCard({required this.data, required this.onCambio});

  @override
  State<_AsistenciaCard> createState() => _AsistenciaCardState();
}

class _AsistenciaCardState extends State<_AsistenciaCard> {
  bool _procesando = false;

  // ── Helpers de tiempo ──
  int _diffMinutos(TimeOfDay ini, TimeOfDay fin) {
    final i = ini.hour * 60 + ini.minute;
    var f = fin.hour * 60 + fin.minute;
    if (f < i) f += 24 * 60;  // si pasa de medianoche
    return f - i;
  }

  TimeOfDay _sumaMinutos(TimeOfDay t, int mins) {
    final total = (t.hour * 60 + t.minute + mins) % (24 * 60);
    return TimeOfDay(hour: total ~/ 60, minute: total % 60);
  }

  String _formatHora(TimeOfDay t) {
    return '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  String _formatFecha(DateTime d) {
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }

  String _horaFinCalculada() {
    final horaInicioStr = widget.data['hora_inicio'] as String?;
    final duracion = widget.data['duracion_min'] as int? ?? 0;
    if (horaInicioStr == null) return '';
    final partes = horaInicioStr.split(':');
    final inicioMin = int.parse(partes[0]) * 60 + int.parse(partes[1]);
    final finMin = (inicioMin + duracion) % (24 * 60);
    final h = (finMin ~/ 60).toString().padLeft(2, '0');
    final m = (finMin % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  Future<void> _confirmarEliminar() async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('¿Eliminar asistencia?'),
        content: Text(
          'Se eliminará la clase de ${widget.data['alumno_nombre']} y se '
          'recalculará su resumen del mes.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar', style: TextStyle(color: AppColors.rojo)),
          ),
        ],
      ),
    );
    if (confirmado != true) return;

    setState(() => _procesando = true);
    try {
      await AsistenciasService.eliminar(widget.data['id']);
      widget.onCambio();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo eliminar: $e'), backgroundColor: AppColors.rojo),
        );
      }
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  /// Modal completo: fecha + hora inicio + hora fin
  Future<void> _editarAsistencia() async {
    // Valores actuales
    final fechaStr = widget.data['fecha'] as String? ?? _formatFecha(DateTime.now());
    final partesFecha = fechaStr.split('-');
    DateTime fechaSel = DateTime(
      int.parse(partesFecha[0]),
      int.parse(partesFecha[1]),
      int.parse(partesFecha[2]),
    );

    final horaInicioStr = widget.data['hora_inicio'] as String? ?? '09:00:00';
    final partesIni = horaInicioStr.split(':');
    TimeOfDay horaIniSel = TimeOfDay(
      hour: int.parse(partesIni[0]),
      minute: int.parse(partesIni[1]),
    );

    final duracion = widget.data['duracion_min'] as int? ?? 60;
    TimeOfDay horaFinSel = _sumaMinutos(horaIniSel, duracion);

    final hoy = DateTime.now();
    final limite = hoy.subtract(const Duration(days: 7));

    final guardar = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setStateDialog) {
            return AlertDialog(
              title: const Text('✏️ Corregir asistencia',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('FECHA',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                            color: AppColors.greyMid, letterSpacing: 0.5)),
                    const SizedBox(height: 6),
                    InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: fechaSel,
                          firstDate: limite,
                          lastDate: hoy,
                          helpText: 'Fecha de la clase',
                          builder: (context, child) => Theme(
                            data: Theme.of(context).copyWith(
                              colorScheme: Theme.of(context).colorScheme.copyWith(primary: AppColors.orange),
                            ),
                            child: child!,
                          ),
                        );
                        if (picked != null) setStateDialog(() => fechaSel = picked);
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.greyBorder),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.calendar_today, size: 16, color: AppColors.orange),
                            const SizedBox(width: 8),
                            Text('${fechaSel.day.toString().padLeft(2, '0')}/${fechaSel.month.toString().padLeft(2, '0')}/${fechaSel.year}',
                                style: const TextStyle(fontSize: 14)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    const Text('HORA DE INICIO',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                            color: AppColors.greyMid, letterSpacing: 0.5)),
                    const SizedBox(height: 6),
                    InkWell(
                      onTap: () async {
                        final picked = await showTimePicker(
                          context: ctx,
                          initialTime: horaIniSel,
                          helpText: 'Hora de inicio',
                          builder: (context, child) => Theme(
                            data: Theme.of(context).copyWith(
                              colorScheme: Theme.of(context).colorScheme.copyWith(primary: AppColors.orange),
                            ),
                            child: child!,
                          ),
                        );
                        if (picked != null) {
                          setStateDialog(() {
                            // Mantener la duración al cambiar la hora de inicio
                            final dur = _diffMinutos(horaIniSel, horaFinSel);
                            horaIniSel = picked;
                            horaFinSel = _sumaMinutos(picked, dur);
                          });
                        }
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.greyBorder),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.access_time, size: 16, color: AppColors.orange),
                            const SizedBox(width: 8),
                            Text(_formatHora(horaIniSel), style: const TextStyle(fontSize: 14, fontFamily: 'monospace')),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    const Text('HORA DE FIN',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                            color: AppColors.greyMid, letterSpacing: 0.5)),
                    const SizedBox(height: 6),
                    InkWell(
                      onTap: () async {
                        final picked = await showTimePicker(
                          context: ctx,
                          initialTime: horaFinSel,
                          helpText: 'Hora de fin',
                          builder: (context, child) => Theme(
                            data: Theme.of(context).copyWith(
                              colorScheme: Theme.of(context).colorScheme.copyWith(primary: AppColors.orange),
                            ),
                            child: child!,
                          ),
                        );
                        if (picked != null) setStateDialog(() => horaFinSel = picked);
                      },
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.greyBorder),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.flag_outlined, size: 16, color: AppColors.orange),
                            const SizedBox(width: 8),
                            Text(_formatHora(horaFinSel), style: const TextStyle(fontSize: 14, fontFamily: 'monospace')),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 10),
                    Text(
                      'Duración: ${_diffMinutos(horaIniSel, horaFinSel)} min',
                      style: const TextStyle(fontSize: 12, color: AppColors.greyMid, fontStyle: FontStyle.italic),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: const Text('Cancelar'),
                ),
                ElevatedButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.orange),
                  child: const Text('Guardar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                ),
              ],
            );
          },
        );
      },
    );

    if (guardar != true) return;

    final durFinal = _diffMinutos(horaIniSel, horaFinSel);
    if (durFinal <= 0 || durFinal > 240) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Duración no válida (1-240 min)'), backgroundColor: AppColors.rojo),
        );
      }
      return;
    }

    setState(() => _procesando = true);
    try {
      await AsistenciasService.actualizar(
        widget.data['id'],
        fecha: _formatFecha(fechaSel),
        horaInicio: '${_formatHora(horaIniSel)}:00',
        duracionMin: durFinal,
      );
      widget.onCambio();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo editar: $e'), backgroundColor: AppColors.rojo),
        );
      }
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final categoria = widget.data['categoria'] ?? 'normal';
    final icono = categoria == 'ingles' ? '🇬🇧' : (categoria == 'sesion' ? '🏥' : '📚');
    final horaInicio = widget.data['hora_inicio'] != null
        ? (widget.data['hora_inicio'] as String).substring(0, 5)
        : '';
    final horaFin = _horaFinCalculada();
    final duracionH = ((widget.data['duracion_min'] as int? ?? 0) / 60).toStringAsFixed(1);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.greyBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(icono, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.data['alumno_nombre'] ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(
                      widget.data['tipo_clase'] ?? '',
                      style: const TextStyle(color: AppColors.greyMid, fontSize: 12),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      horaFin.isNotEmpty ? '$horaInicio-$horaFin · ${duracionH}h' : horaInicio,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: AppColors.greyMid,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (widget.data['sincronizado'] == false) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF3C7),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text('OFFLINE',
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: Color(0xFF92400E))),
            ),
          ],
          if (_procesando)
            const Padding(
              padding: EdgeInsets.only(left: 8),
              child: SizedBox(
                width: 16, height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.orange),
              ),
            )
          else
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, size: 18, color: AppColors.greyMid),
              onSelected: (v) {
                if (v == 'editar') _editarAsistencia();
                if (v == 'eliminar') _confirmarEliminar();
              },
              itemBuilder: (ctx) => const [
                PopupMenuItem(value: 'editar', child: Text('Corregir fecha y hora')),
                PopupMenuItem(value: 'eliminar', child: Text('Eliminar')),
              ],
            ),
        ],
      ),
    );
  }
}